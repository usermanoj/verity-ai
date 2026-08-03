import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/supabase/config";
import type { GradeResult } from "@/lib/grade";

// Fire-and-forget from the client after grading — grading itself stays
// entirely client-side (lib/grade.ts, deterministic, no network round-trip)
// so this endpoint only ever records the result, never computes it. Always
// returns 200: a logging failure must never surface as a UI error to a
// student answering a practice question.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ logged: false });
  }

  const user = await getCurrentAppUser();

  // Students only, matching what conversationFor() already does for the
  // tutor. A teacher trying their own practice questions was being recorded
  // as if it were student work — harmless while no teacher is enrolled in a
  // class, and silently wrong the moment one enrols themselves to preview a
  // lesson, which is a normal thing to do. Two logging paths disagreeing
  // about who counts is the kind of inconsistency that surfaces later as a
  // figure nobody can explain.
  if (!user || user.role !== "student") {
    return NextResponse.json({ logged: false });
  }

  try {
    const { questionId, answer, gradedResult, prompt, level } = (await req.json()) as {
      questionId: string;
      answer: string;
      gradedResult: GradeResult;
      prompt?: string;
      level?: string;
    };

    const supabase = await supabaseServer();

    // Which deck this answer was about.
    //
    // The column has existed since 0028 and nothing has ever written to it:
    // every one of the first thirty-two attempts recorded stored null. Nobody
    // noticed because nothing read it — until the per-topic breakdown did, and
    // would have shown every teacher an empty panel forever.
    //
    // Derived here rather than sent by the client: the browser knows the
    // topic, but a figure a teacher acts on should not be something a page can
    // assert about itself. Looked up through the generated question, which is
    // the only link that exists — and stored rather than re-derived at read
    // time, because regenerating a deck deletes its questions and that is
    // precisely the case the snapshot columns below exist for.
    //
    // Null for the two seeded demo topics, whose hand-authored banks reference
    // no document. That is the right answer, not a gap.
    const documentId = await documentFor(supabase, UUID.test(questionId) ? questionId : null);

    const { error } = await supabase.from("practice_attempts").insert({
      student_id: user.id,
      question_id: questionId,
      // The constrained reference, set only for generated questions. The two
      // seeded demo topics use hand-authored banks whose ids ("e1", "m1") are
      // not uuids and reference no row, so they keep question_id alone —
      // which is why the foreign key needed its own column rather than
      // replacing the existing one.
      generated_question_id: UUID.test(questionId) ? questionId : null,
      answer,
      graded_result: gradedResult,
      graded_by: "rule",
      // Snapshotted, because re-uploading a deck regenerates its questions
      // and the old attempt is left pointing at nothing. 15 of the first 26
      // attempts recorded were already unreadable that way — a child's answer
      // is evidence about that child, and it must not become meaningless
      // because a teacher tidied their uploads.
      question_prompt: prompt?.slice(0, 500) ?? null,
      question_level: level ?? null,
      document_id: documentId,
    });

    // The insert's result used to be discarded, so this route answered
    // "logged: true" whether or not anything was written. After an
    // end-to-end test that produced zero attempts, there was no way to tell
    // whether the student never pressed Check or every write had been
    // rejected — the two look identical from here, and that is precisely the
    // failure mode this codebase keeps rediscovering.
    if (error) {
      console.error("[api/practice/attempt] insert rejected:", error);
      return NextResponse.json({ logged: false, detail: error.message });
    }

    return NextResponse.json({ logged: true });
  } catch (err) {
    console.error("[api/practice/attempt] threw:", err);
    return NextResponse.json({ logged: false });
  }
}

/**
 * The document a generated question belongs to, or null.
 *
 * Never throws. This runs inside a route whose whole contract is that a
 * logging failure must not reach a child mid-question — losing the topic is a
 * thinner analytic, losing the answer is losing evidence about a pupil.
 */
async function documentFor(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  generatedQuestionId: string | null,
): Promise<string | null> {
  if (!generatedQuestionId) return null;
  try {
    const { data, error } = await supabase
      .from("generated_questions")
      .select("chunk_id, corpus_chunks(document_id)")
      .eq("id", generatedQuestionId)
      .maybeSingle();
    if (error) {
      console.error("[api/practice/attempt] topic lookup failed:", error.message);
      return null;
    }
    const chunk = (data as { corpus_chunks?: { document_id?: string } | null } | null)?.corpus_chunks;
    return chunk?.document_id ?? null;
  } catch (err) {
    console.error("[api/practice/attempt] topic lookup threw:", err);
    return null;
  }
}
