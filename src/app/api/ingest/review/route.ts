import { NextRequest, NextResponse, after } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generatePracticeQuestions } from "@/lib/questions/generate";
import { mapAiCalls } from "@/lib/ai";
import { translateDocument } from "@/lib/translate/batch";
import { suggestVisualsForDocument } from "@/lib/visuals/run";
import { atLeast } from "@/lib/roles";

export const runtime = "nodejs";

// Applies the teacher's approve/reject decision directly.
//
// This used to call resumeHook() to wake a suspended workflow, which meant
// every review travelled through the workflow engine — the same dispatch
// latency measured at 8–11s on the ingest path. Approval is only a database
// state change, so durability buys nothing here. Doing it directly also
// works uniformly for PPTX (which no longer starts a workflow at all).
//
// It additionally fixes a real hole: resumeHook() was keyed purely on
// `review:${documentId}`, so any signed-in teacher could approve or reject
// another teacher's document by guessing its id. Ownership is now verified.
export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Ingestion isn't configured for this deployment yet." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || !atLeast(user.role, "teacher")) {
    return NextResponse.json({ error: "Only signed-in teachers can review." }, { status: 403 });
  }

  const { documentId, approved } = (await req.json().catch(() => ({}))) as {
    documentId?: string;
    approved?: boolean;
  };
  if (!documentId || typeof approved !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: doc } = await admin
    .from("corpus_documents")
    .select("uploaded_by")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.uploaded_by !== user.id) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const { error: statusError } = await admin
    .from("corpus_documents")
    .update({ status: approved ? "approved" : "rejected" })
    .eq("id", documentId);
  if (statusError) {
    return NextResponse.json({ error: "Couldn't save your decision — please try again." }, { status: 500 });
  }

  if (approved) {
    await admin
      .from("corpus_chunks")
      .update({ approved_by: user.id, approved_at: new Date().toISOString() })
      .eq("document_id", documentId);

    // Generate practice questions for the whole document now, rather than
    // waiting for the teacher to click "Generate" on each chunk in turn — a
    // deck of 20 chunks meant 20 clicks, so in practice material reached
    // students with no questions at all and the Practice Zone sat empty.
    //
    // They're written as `pending`, so the human-approval guarantee is
    // untouched: nothing reaches a student until the teacher ticks it.
    //
    // after() rather than a bare `void`: the teacher's Approve click must not
    // wait on forty model calls, but a floating promise is not a background
    // job. Once the response is sent the serverless invocation can be frozen
    // or torn down, so the generation was being killed part-way through — or
    // never starting — which is why decks finished approval with no questions
    // at all. after() is the platform's own contract for work that outlives
    // the response, and it keeps the invocation alive until this settles.
    //
    // A failure here still leaves the (already approved) material perfectly
    // usable, just without generated questions yet.
    after(() => generateQuestionsForDocument(documentId, user.id));

    // Translate the deck now, so the Chinese exists before any student sees
    // the material and the teacher can read it first in Teacher → Language.
    // Corrections used to be reactive — a passage only appeared for review
    // after a student had already been shown the model's version — which is
    // the wrong way round for anything a school is accountable for.
    //
    // Same after() reasoning as above: the Approve click must not wait on
    // thirty model calls, and a floating promise would be torn down with the
    // invocation. Failure leaves the material perfectly usable in English.
    after(() => translateDocument(documentId));

    // And propose interactives for the sections the matching rules left bare,
    // so a deck arrives with its illustrations already thought about.
    //
    // The deterministic half needs nothing here: matching runs on every render
    // and a data table draws itself as a graph. Only the model's half needed
    // starting, and leaving that to a button meant every deck approved before
    // anyone found the button stayed bare — the same failure the questions
    // above had, for the same reason.
    //
    // One call for the whole document, and the result is a row in a table no
    // student can read. Nothing here can change what a child sees; the teacher
    // still accepts each one.
    after(() => suggestVisualsForDocument(documentId).catch(() => {}));
  } else {
    // Rejected chunks shouldn't linger as if they might still be used.
    await admin.from("corpus_chunks").delete().eq("document_id", documentId);
  }

  return NextResponse.json({ ok: true });
}

// One model call per chunk, run concurrently and capped, then a single insert.
// Every row lands as `pending` for the teacher to tick or discard.
async function generateQuestionsForDocument(documentId: string, teacherId: string) {
  try {
    const admin = supabaseAdmin();
    const { data: chunks } = await admin
      .from("corpus_chunks")
      .select("id, heading, text")
      // A cap keeps a very long document from firing a hundred model calls;
      // the per-chunk "Generate" button still covers the remainder.
      .eq("document_id", documentId)
      .limit(40);
    if (!chunks || chunks.length === 0) return;

    // mapAiCalls, not Promise.all: this fanned out one call per chunk with no
    // ceiling, so approving a 30-section deck asked the Gateway for thirty
    // completions at the same instant. On the free tier that is an immediate
    // rate limit rather than speed — and since each question set is
    // independent, the work is identical either way, just spread out.
    const generated = await mapAiCalls(chunks, async (chunk) => {
      try {
        const questions = await generatePracticeQuestions(chunk.heading, chunk.text);
        return questions.map((q) => ({
          chunk_id: chunk.id,
          level: q.level,
          prompt: q.prompt,
          question: q.question as unknown as Record<string, unknown>,
          status: "pending" as const,
          generated_by: teacherId,
        }));
      } catch {
        // One chunk failing shouldn't cost the whole document its questions.
        return [];
      }
    });

    const rows = generated.flat();
    if (rows.length > 0) await admin.from("generated_questions").insert(rows);
  } catch {
    // Deliberately silent: the material is already approved and usable.
  }
}
