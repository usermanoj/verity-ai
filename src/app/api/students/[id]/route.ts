import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/supabase/config";
import { getCurrentAppUser } from "@/lib/auth";
import { atLeast } from "@/lib/roles";

export const runtime = "nodejs";

// One student's wrong answers and tutor transcript, for their teacher.
//
// Ownership is decided inside teacher_student_detail against auth.uid() — a
// teacher may read a pupil enrolled in a section they own, and nobody else.
// This route does not re-derive that rule: two answers to "is this my
// student" is how they drift apart, and the one that drifts is the one that
// leaks a child's conversation.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!hasSupabase()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const user = await getCurrentAppUser();
  if (!user || !atLeast(user.role, "teacher")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc("teacher_student_detail", { p_student_id: id });
    if (error) {
      console.error("[api/students] detail lookup failed:", error);
      return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/students] threw:", err);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
