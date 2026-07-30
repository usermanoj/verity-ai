import { NextRequest } from "next/server";
import { streamText } from "ai";
import { AI_PROVIDER, aiModel, gatewayFailover, GATEWAY_FALLBACK_MODELS, hasApiKey, cachedSystem } from "@/lib/ai";
import { hasLangfuse } from "@/lib/observability";
import { logEvent } from "@/lib/events";
import {
  buildSystemPrompt,
  fallbackReply,
  replyBudget,
  splitLegacyLevel,
  type Intent,
  type LegacyEslLevel,
} from "@/lib/tutor";
import { contentRepo } from "@/lib/content-repo";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { canSee, visibleDocuments } from "@/lib/access";
import { conversationFor, logTurn } from "@/lib/conversations";
import { claimAiCall } from "@/lib/ai-usage";

export const runtime = "nodejs";

type HistoryTurn = { role: "user" | "assistant"; content: string };

const VALID_INTENTS: Intent[] = ["explain", "translate", "example", "askme", "check"];
// "beginner_zh" is still accepted: it is what a browser stored before reading
// level and Chinese support became separate controls, and rejecting it would
// error a student mid-lesson over a type change of ours.
const VALID_LEVELS: LegacyEslLevel[] = ["advanced", "intermediate", "beginner", "beginner_zh"];
const MAX_TEXT_LEN = 2000;
const MAX_HISTORY_TURNS = 40;

// Streaming protocol: newline-delimited JSON. One or more
// {"type":"delta","text":"..."} lines as text arrives, followed by exactly
// one {"type":"done",...} line. Demo mode uses the same protocol (a single
// delta, then done) so the client never needs two code paths.
function jsonLine(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj) + "\n");
}

function jsonError(reply: string, status: number) {
  const body =
    JSON.stringify({ type: "delta", text: reply }) + "\n" + JSON.stringify({ type: "done", error: true }) + "\n";
  return new Response(body, { status, headers: { "Content-Type": "application/x-ndjson" } });
}

export async function POST(req: NextRequest) {
  let body: {
    topicId?: string;
    intent: Intent;
    question: string;
    level: LegacyEslLevel;
    chinese?: boolean;
    answer?: string;
    turn?: number;
    history?: HistoryTurn[];
    contextChunkId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request.", 400);
  }

  // Defense in depth: reject malformed/oversized input cheaply, before it
  // ever reaches Claude — bounds cost per request regardless of the
  // middleware's rate limit.
  if (!VALID_INTENTS.includes(body.intent)) {
    return jsonError("Invalid request.", 400);
  }
  if (body.level !== undefined && !VALID_LEVELS.includes(body.level)) {
    return jsonError("Invalid request.", 400);
  }
  if ((body.question?.length ?? 0) > MAX_TEXT_LEN || (body.answer?.length ?? 0) > MAX_TEXT_LEN) {
    return jsonError("That message is too long.", 400);
  }
  if (body.history && body.history.length > MAX_HISTORY_TURNS) {
    return jsonError("Conversation too long — please start a new topic.", 400);
  }

  const { topicId, intent, question, level, answer, turn, history, contextChunkId } = body;
  // Two axes now. A legacy "beginner_zh" carries its own answer to both; a
  // modern client sends them separately.
  const legacy = splitLegacyLevel(level ?? "intermediate");
  const eslLevel = legacy.level;
  const wantsChinese = legacy.chinese || body.chinese === true;
  const turnNum = turn ?? 0;
  const topic = topicId ?? "moments";

  // Gating the topic PAGE is not enough: this endpoint returns the same
  // approved material, quoted and cited, to anyone who posts a topic id. It
  // was open. A student must be signed in and the document must reach a class
  // they are in — the same rule the page applies, applied at the other door.
  //
  // Skipped entirely when Supabase isn't configured, so a preview deployment
  // stays in demo mode on the seeded topics rather than refusing every
  // request it has no way to authorise.
  let viewer: Awaited<ReturnType<typeof getCurrentAppUser>> = null;
  if (hasSupabase()) {
    const user = await getCurrentAppUser();
    if (!user) return jsonError("Please sign in to use the assistant.", 401);
    viewer = user;
    if (!canSee(await visibleDocuments(user), topic)) {
      // Same wording as an unknown topic: a refusal should not reveal that
      // this document exists.
      return jsonError("That topic isn't available.", 404);
    }
  }

  // "tutor_message" means STUDENT usage — it is what the engagement figures
  // count. logEvent itself stays generic, so staff auditing can use it later
  // under its own event type; the filter belongs here, where the meaning of
  // the event is known.
  const isStudent = viewer?.role === "student";

  if (!hasApiKey()) {
    if (isStudent) void logEvent("tutor_message", { intent, topicId: topic, demo: true });
    const fb = await fallbackReply(topic, intent, question, turnNum, contextChunkId);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(jsonLine({ type: "delta", text: fb.text }));
        controller.enqueue(jsonLine({ type: "done", demo: true, sourceId: fb.sourceId }));
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
  }

  // Past the demo branch, so a real model call is now certain. Counted here
  // rather than at the top of the handler because a fallback reply costs
  // nothing and must not spend a student's day.
  //
  // Skipped without Supabase for the same reason auth is: a preview deployment
  // has no accounts to count against.
  let callsLeft: number | null = null;
  if (hasSupabase()) {
    const claim = await claimAiCall("tutor");
    if (!claim.verdict.allowed) {
      // 429, and the message is written for a child reading it mid-lesson. It
      // says what still works, because "limit reached" to an eleven-year-old
      // reads as "you have broken it".
      return jsonError(claim.verdict.message, 429);
    }
    // Carried to the client on the done line, so a student close to their limit
    // is warned rather than cut off without notice.
    callsLeft = claim.callsLeft;
  }

  // Whether the student typed anything, as opposed to tapping the button
  // again — the prompt treats those very differently (see intentGuide).
  const studentReplied = typeof question === "string" && question.trim().length > 0;
  const system = await buildSystemPrompt(
    topic,
    eslLevel,
    intent ?? "explain",
    turnNum,
    studentReplied,
    wantsChinese,
  );

  let userText: string;
  if (intent === "check") {
    const contextChunk = contextChunkId ? await contentRepo.getCorpusChunk(contextChunkId) : undefined;
    userText = contextChunk
      ? `The student is working on a problem related to: "${contextChunk.text}" (source: ${contextChunk.source}). ` +
        `Their attempted answer/working: "${answer}". Give a hint about what to check — do not give the final answer.`
      : `The student tapped "Check My Answer" but no specific question has been established in this conversation yet. ` +
        `Their input: "${answer || question}". Do NOT invent or guess a problem — ask them to state or paste the exact ` +
        `question they are solving, then you can check their working once you know it.`;
  } else {
    userText = question || "Please help me understand this topic.";
  }

  // Thread real conversation history so the model actually remembers what it
  // already said — without this, "then?" / "what next?" has nothing to build on.
  const priorTurns = (history ?? []).map((h) => ({ role: h.role, content: h.content }));

  if (isStudent) void logEvent("tutor_message", { intent, topicId: topic, demo: false });

  // Opened before streaming so the student's question is recorded even if the
  // model call then fails — a transcript that only keeps the exchanges that
  // went well is not a record of how a student is doing.
  const conversationId = await conversationFor(viewer, topic);
  await logTurn(conversationId, "user", userText, intent);

  const stream = new ReadableStream({
    async start(controller) {
      let assistantText = "";
      // streamText does NOT throw when the provider fails — it reports through
      // onError and ends the stream empty. Without a handler the failure was
      // completely invisible: nothing in the logs, and a student staring at
      // "the AI had a problem" with no way to find out which problem.
      //
      // This is where the answer lives for the whole class of provider
      // failures — no credit, bad key, unknown model, rate limit — so it must
      // never be dropped again.
      let streamFailure: string | null = null;
      try {
        const result = streamText({
          model: aiModel("primary"),
          // Scales with how many times the student has asked for more (see
          // replyBudget) — a first answer that streams for twenty seconds is
          // a first answer nobody reads.
          maxOutputTokens: replyBudget(intent ?? "explain", turnNum).maxOutputTokens,
          system: cachedSystem(system),
          messages: [...priorTurns, { role: "user", content: userText }],
          experimental_telemetry: { isEnabled: hasLangfuse(), functionId: "tutor" },
          providerOptions: gatewayFailover(GATEWAY_FALLBACK_MODELS),
          onError({ error }) {
            streamFailure = error instanceof Error ? error.message : String(error);
            console.error(`[api/tutor] provider "${AI_PROVIDER}" failed:`, error);
          },
        });
        let receivedAnyText = false;
        for await (const textDelta of result.textStream) {
          receivedAnyText = true;
          assistantText += textDelta;
          controller.enqueue(jsonLine({ type: "delta", text: textDelta }));
        }
        // A model can fail (plan restriction, provider error) without ever
        // throwing — result.textStream just completes empty. Without this
        // check that surfaces as a silent "success" with nothing shown,
        // exactly what happened with the original claude-opus-4.8 default.
        if (!receivedAnyText) {
          // The student gets the same calm message either way — the detail is
          // for the logs and the teacher's error panel, not for a twelve-year-
          // old mid-lesson.
          if (!streamFailure) {
            console.error(
              `[api/tutor] provider "${AI_PROVIDER}" returned an empty stream with no error`,
            );
          }
          controller.enqueue(jsonLine({ type: "delta", text: "⚠️ The AI had a problem generating a reply. Please try again." }));
          controller.enqueue(jsonLine({ type: "done", error: true, detail: streamFailure ?? "empty_stream" }));
        } else {
          controller.enqueue(jsonLine({ type: "done", demo: false, callsLeft }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(jsonLine({ type: "delta", text: `⚠️ The AI had a problem: ${message}. Please try again.` }));
        controller.enqueue(jsonLine({ type: "done", error: true }));
      } finally {
        controller.close();
        // After close, so recording never delays the last token reaching the
        // student. The invocation stays alive for the stream, so this still
        // runs — and if it doesn't, the reply was already delivered.
        void logTurn(
          conversationId,
          "assistant",
          assistantText,
          intent,
          contextChunkId ? [contextChunkId] : [],
        );
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
