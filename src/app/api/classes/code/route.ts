import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import { atLeast } from "@/lib/roles";

export const runtime = "nodejs";

// Creates or replaces a section's join code.
//
// The ownership check lives in the RPC, keyed on auth.uid(), not here — a
// class id in a request body is the caller's claim, and a route that checks
// it can be forgotten in a way a SECURITY DEFINER function cannot.
export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Not configured for this deployment." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || !atLeast(user.role, "teacher")) {
    return NextResponse.json({ error: "Only signed-in teachers can create class codes." }, { status: 403 });
  }

  const { classId } = (await req.json().catch(() => ({}))) as { classId?: string };
  if (!classId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("rotate_class_code", { p_class_id: classId });
  if (error) return NextResponse.json({ error: "Couldn't create a code — please try again." }, { status: 500 });

  const result = (data ?? {}) as { error?: string; code?: string };
  if (result.error) return NextResponse.json({ error: result.error }, { status: 403 });

  return NextResponse.json({ code: result.code });
}
