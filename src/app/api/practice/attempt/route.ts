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
  if (!user) {
    // No signed-in student yet — student-facing pages aren't auth-gated
    // (see ROADMAP.md §7), so this is the expected common case today, not
    // an error.
    return NextResponse.json({ logged: false });
  }

  try {
    const { questionId, answer, gradedResult } = (await req.json()) as {
      questionId: string;
      answer: string;
      gradedResult: GradeResult;
    };

    const supabase = await supabaseServer();
    await supabase.from("practice_attempts").insert({
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
    });

    return NextResponse.json({ logged: true });
  } catch {
    return NextResponse.json({ logged: false });
  }
}
