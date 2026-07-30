import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/supabase/config";
import { getCurrentAppUser } from "@/lib/auth";
import { atLeast } from "@/lib/roles";

export const runtime = "nodejs";

const LEVELS = ["advanced", "intermediate", "beginner"];

// Saving a reading level: a student for themselves, or a teacher for a student
// they teach.
//
// Two functions rather than one branching on role. "May I change my own
// preference" and "may I change this child's preference" are different
// questions with different answers, and a single function answering both is
// how the second one ends up as an afterthought. Both decide ownership
// themselves, against auth.uid().
export async function POST(req: NextRequest) {
  if (!hasSupabase()) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  let body: { studentId?: string; level?: string; chinese?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (body.level !== undefined && !LEVELS.includes(body.level)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = await supabaseServer();

  // No studentId means "my own", whoever I am. A teacher previewing a lesson
  // is entitled to set their own reading level too.
  if (!body.studentId) {
    const { data, error } = await supabase.rpc("set_my_language", {
      p_level: body.level ?? null,
      p_chinese: body.chinese ?? null,
    } as never);
    if (error) {
      console.error("[api/language/level] could not save own preference:", error);
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: data === true });
  }

  if (!atLeast(user.role, "teacher")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("set_student_language", {
    p_student_id: body.studentId,
    p_level: body.level ?? null,
    p_chinese: body.chinese ?? null,
  } as never);
  if (error) {
    console.error("[api/language/level] could not save student preference:", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  // false means the student isn't in a section this teacher owns.
  if (!data) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
