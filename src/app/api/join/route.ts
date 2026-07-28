import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Redeems a class join code for the signed-in user.
//
// Deliberately says the same thing for a code that does not exist, one that
// has been revoked, and one belonging to another school: a distinguishing
// error would turn this endpoint into an oracle for testing guessed codes.
export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Not configured for this deployment." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!code || code.trim().length < 4) {
    return NextResponse.json({ error: "Enter the code your teacher gave you." }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("redeem_join_code", { p_code: code });
  if (error) return NextResponse.json({ error: "Couldn't join just now — please try again." }, { status: 500 });

  const result = (data ?? {}) as { error?: string; joined?: boolean; subject?: string; grade?: string; section?: string };
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json(result);
}
