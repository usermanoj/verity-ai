import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/supabase/config";
import { getCurrentAppUser } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { reportError } from "@/lib/errors/report";

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
    // Both in one round trip. The panel opens on a click and a second
    // sequential request would be visible as a stutter.
    const [detail, timeline] = await Promise.all([
      supabase.rpc("teacher_student_detail", { p_student_id: id }),
      supabase.rpc("teacher_student_timeline", { p_student_id: id }),
    ]);
    if (detail.error) {
      await reportError("analytics", detail.error, "student detail lookup failed");
      return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
    }
    // The timeline failing must not cost a teacher the wrong answers and the
    // transcript, which are the older and more important half of this panel.
    // Reported, then the panel renders without it.
    if (timeline.error) await reportError("analytics", timeline.error, "student timeline lookup failed");

    const events = timeline.error ? [] : ((timeline.data as { events?: unknown[] } | null)?.events ?? []);
    return NextResponse.json({ ...(detail.data as object), events });
  } catch (err) {
    console.error("[api/students] threw:", err);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }
}
