import { CORPUS, TOPICS, type CorpusChunk } from "@/data/corpus";

export type Intent = "explain" | "translate" | "example" | "askme" | "check";
export type EslLevel = "advanced" | "intermediate" | "beginner" | "beginner_zh";

// Vectorless / long-context RAG: for a small curated per-topic corpus we inject
// the whole approved set and force the model to cite. No embeddings, no drift.
export function corpusForTopic(topicId: string): CorpusChunk[] {
  return CORPUS.filter((c) => c.topicId === topicId);
}

function corpusBlock(chunks: CorpusChunk[]): string {
  return chunks
    .map((c) => `<source id="${c.id}" cite="${c.source}">\n${c.heading}: ${c.text}\n</source>`)
    .join("\n\n");
}

const LEVEL_GUIDE: Record<EslLevel, string> = {
  advanced: "The student has strong English. Use normal academic English.",
  intermediate:
    "The student is an intermediate ESL learner. Use simpler English, short sentences, and define hard words in brackets.",
  beginner:
    "The student is a beginner ESL learner. Use very simple English, very short sentences, and everyday words. Explain every technical term.",
  beginner_zh:
    "The student is a beginner ESL learner whose first language is Chinese. Use very simple English, then give a short Simplified Chinese (中文) gloss in brackets after key sentences and technical terms.",
};

const INTENT_GUIDE: Record<Intent, string> = {
  explain:
    "EXPLAIN the concept the student asks about, simply and step by step. Do NOT give the final answer to any assignment question — teach the idea instead.",
  example:
    "Give ONE clear worked EXAMPLE from the approved material, showing the formula and each step. Then invite the student to try a similar one.",
  askme:
    "Ask the student exactly ONE short guiding (Socratic) question — never two at once. Do NOT explain the concept yourself. Wait for their answer.",
  check:
    "The student will show their attempt. Give a HINT about what to check — never just the answer. Point them to the relevant rule or step.",
  translate: "Translate faithfully; keep physics terms accurate.",
};

// "askme" needs a different instruction once the student has actually replied
// to the previous guiding question — otherwise the model just fires more
// unrelated questions instead of honestly reacting to what the student said.
function intentGuide(intent: Intent, turn: number): string {
  if (intent === "askme" && turn > 0) {
    return (
      "The student has just answered your previous guiding question — read their answer in the conversation history. " +
      "Tell them plainly whether they are right, partly right, or off track, grounded ONLY in the approved material " +
      "(do not praise an answer you have not actually evaluated). Briefly give the correct idea if they were off. " +
      "THEN ask exactly ONE new guiding question that goes further — never two at once."
    );
  }
  return INTENT_GUIDE[intent];
}

export function buildSystemPrompt(topicId: string, level: EslLevel, intent: Intent, turn = 0): string {
  const chunks = corpusForTopic(topicId);
  const meta = TOPICS[topicId] ?? TOPICS["moments"];
  const progressNote =
    turn > 0
      ? `\n6. The student is continuing the same "${intent}" thread (turn ${turn + 1}) — look at the conversation history and do NOT repeat a previous reply. Go deeper, use a different worked example, or ask a different guiding question than before.`
      : "";
  return `You are Verity AI, the tutor for ${meta.grade} ${meta.subject}, topic "${meta.title}".
You are a patient guide for English-as-a-Second-Language students at an international school (IG & IB curriculum).

ABSOLUTE RULES — follow every time:
1. Answer ONLY using the APPROVED MATERIAL between <source> tags below. This is the school's own textbook/slides/worksheets.
2. If the question cannot be answered from the approved material, say so briefly and steer the student back to the topic. Do NOT use outside/internet knowledge, and do NOT guess.
3. ALWAYS end your reply with a citation line naming the source(s) you used, formatted exactly as:
   "📖 Based on: <cite value>"
4. NEVER complete a whole assignment or give the final numeric answer to a task the student must do. Guide, hint, and ask questions instead (academic integrity).
5. Be encouraging and concise. ${LEVEL_GUIDE[level]}${progressNote}

TASK MODE: ${intentGuide(intent, turn)}

APPROVED MATERIAL:
${corpusBlock(chunks)}`;
}

export type FallbackResult = { text: string; sourceId?: string };

// Rotation order for demo/offline mode, PER TOPIC — every repeated tap of a
// button surfaces genuinely different, corpus-grounded content instead of a
// static canned reply. `turn` is computed by the client as "how many times in
// a row (with nothing else in between) has this exact intent been used" — so
// it resets to 0, and this rotation restarts from the top, whenever the
// student does something else first. (Live mode gets real variety from
// conversation memory instead; see route.ts, which threads full history.)
const EXPLAIN_IDS_BY_TOPIC: Record<string, string[]> = {
  moments: ["m-def", "m-principle", "m-net", "m-ws7-lever"],
  "distance-time": ["dt-def", "dt-axes", "dt-gradient", "dt-ws2-cyclist"],
};
const EXAMPLE_IDS_BY_TOPIC: Record<string, string[]> = {
  moments: ["m-seesaw", "m-rearrange", "m-ws7-rock"],
  "distance-time": ["dt-uniform-table", "dt-gradient-example", "dt-ws2-cyclist"],
};

// One guiding question at a time — never bundle two, so it's always
// unambiguous which question the student is answering.
const ASKME_QUESTIONS_BY_TOPIC: Record<string, { chunkId: string; q: string }[]> = {
  moments: [
    { chunkId: "m-def", q: "What two things does the size of a moment depend on?" },
    { chunkId: "m-def", q: "What is the unit of a moment, and why is it that unit?" },
    { chunkId: "m-principle", q: "When a seesaw is balanced, what must be true about the clockwise and anticlockwise moments?" },
    { chunkId: "m-principle", q: "What do we call the fixed point a beam turns around?" },
    { chunkId: "m-net", q: "If the clockwise moments add up to more than the anticlockwise moments, which way will the beam turn?" },
    { chunkId: "m-net", q: "How do you work out the net moment when several forces act on a beam?" },
    { chunkId: "m-ws7-lever", q: "Besides the number, what two other things must you always state in a moments answer?" },
    { chunkId: "m-ws7-lever", q: "Why must you convert distances to metres before calculating a moment?" },
  ],
  "distance-time": [
    { chunkId: "dt-def", q: "What does 'steady speed' mean?" },
    { chunkId: "dt-axes", q: "Which variable — time or distance — goes on the x-axis of a distance-time graph, and why?" },
    { chunkId: "dt-stationary", q: "What shape does a distance-time graph make when an object is not moving?" },
    { chunkId: "dt-gradient", q: "What does the gradient (slope) of a distance-time graph tell you?" },
    { chunkId: "dt-gradient-example", q: "If distance goes from 50 m to 150 m as time goes from 1 s to 3 s, how would you calculate the speed?" },
    { chunkId: "dt-ws2-cyclist", q: "If a cyclist travels 200 m in 100 s, what formula would you use to find their speed?" },
  ],
};

function byId(id: string): CorpusChunk {
  const c = CORPUS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown corpus chunk: ${id}`);
  return c;
}
const citeOf = (c: CorpusChunk) => `📖 Based on: ${c.source} (demo mode)`;

// Hints for "Check My Answer", one per numeric worked-example chunk — used
// only when we know WHICH problem the student is working on (contextChunkId).
// Without that, there is nothing real to check, so we say so honestly instead
// of guessing (see the "check" case below). Exported so the client can gate
// the Check button itself: it should only be enabled once one of these
// numeric chunks has actually been shown (via Explain or Give Example) —
// checking against a bare definition/principle chunk makes no sense.
export const CHECK_HINTS: Record<string, string> = {
  "m-seesaw":
    "did you set clockwise moment = anticlockwise moment (F₁×d₁ = F₂×d₂)? Have you correctly identified which weight or distance you're solving for?",
  "m-rearrange":
    "did you rearrange Moment = Force × distance into Force = Moment ÷ distance? Did you convert the distance from cm to metres first?",
  "m-ws7-lever":
    "did you use Moment = Force × distance, and did you convert the distance to metres first? Did you state the unit (Nm) and the direction (clockwise / anticlockwise)?",
  "m-ws7-rock":
    "did you calculate the moment for the person AND the rock separately (Moment = Force × distance for each) before comparing them?",
  "dt-uniform-table":
    "did you find how much the distance increases each second, and use that as the speed? Speed = (change in distance) ÷ (change in time).",
  "dt-gradient-example":
    "did you use gradient = (y2 − y1) ÷ (x2 − x1), i.e. (change in distance) ÷ (change in time)? Did you subtract the EARLIER point from the LATER point consistently on both axes?",
  "dt-ws2-cyclist":
    "did you convert the time into seconds first (1 minute 40 seconds = 100 s), then use speed = distance ÷ time?",
};
export const CHECKABLE_CHUNK_IDS = Object.keys(CHECK_HINTS);

// Deterministic fallback so the UI is fully demoable before an API key is set.
export function fallbackReply(
  topicId: string,
  intent: Intent,
  question: string,
  turn = 0,
  contextChunkId?: string,
): FallbackResult {
  const explainIds = EXPLAIN_IDS_BY_TOPIC[topicId] ?? EXPLAIN_IDS_BY_TOPIC["moments"];
  const exampleIds = EXAMPLE_IDS_BY_TOPIC[topicId] ?? EXAMPLE_IDS_BY_TOPIC["moments"];
  const askmeQuestions = ASKME_QUESTIONS_BY_TOPIC[topicId] ?? ASKME_QUESTIONS_BY_TOPIC["moments"];

  switch (intent) {
    case "explain": {
      const id = explainIds[turn % explainIds.length];
      const c = byId(id);
      const lead = turn === 0 ? "" : "Let's go a bit deeper — ";
      return { text: `${lead}${c.text}\n\n${citeOf(c)}`, sourceId: id };
    }
    case "example": {
      const id = exampleIds[turn % exampleIds.length];
      const c = byId(id);
      return {
        text: `Worked example: ${c.text}\n\nNow try a similar one yourself!\n\n${citeOf(c)}`,
        sourceId: id,
      };
    }
    case "askme": {
      const idx = turn % askmeQuestions.length;
      const item = askmeQuestions[idx];
      const c = byId(item.chunkId);
      if (turn === 0) {
        return { text: `Let's think it through:\n${item.q}\n\n${citeOf(c)}`, sourceId: item.chunkId };
      }
      // We can't grade free-text in demo mode, so we never claim to have
      // evaluated it — instead, honestly hand over the relevant fact so the
      // student can compare it against their own answer, then ask the next
      // single question.
      const prevItem = askmeQuestions[(turn - 1) % askmeQuestions.length];
      const prevChunk = byId(prevItem.chunkId);
      return {
        text:
          `Thanks for answering. Here's the approved material to compare your answer with: ${prevChunk.text}\n\n` +
          `Next question:\n${item.q}\n\n${citeOf(c)}`,
        sourceId: item.chunkId,
      };
    }
    case "check": {
      if (contextChunkId && CHECK_HINTS[contextChunkId]) {
        const c = byId(contextChunkId);
        return {
          text: `Let's check your working — ${CHECK_HINTS[contextChunkId]} Fix that, then show me again.\n\n${citeOf(c)}`,
          sourceId: contextChunkId,
        };
      }
      // No established numeric problem in this conversation — don't guess or
      // point at an unrelated worksheet.
      return {
        text:
          "I don't have a specific question in view yet, so I can't check your working against the right numbers. " +
          'Tap "Give Example" first (or ask to Explain a worked example), then tap Check My Answer again.',
      };
    }
    case "translate": {
      // The Translate button now calls /api/translate directly (see AiTutorPanel),
      // which has reviewed per-chunk translations. This case is a rarely-hit
      // fallback if /api/tutor is ever called with intent=translate directly.
      const c = byId(explainIds[0]);
      return { text: `${c.text}\n\n${citeOf(c)}`, sourceId: c.id };
    }
    default:
      return { text: `I can help with "${question || "this topic"}" using your class material. Try the Explain or Example button.` };
  }
}
