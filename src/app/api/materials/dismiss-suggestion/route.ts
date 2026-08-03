import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import { reportError } from "@/lib/errors/report";

export const runtime = "nodejs";

// "No thanks" to a proposal.
//
// Deliberately not the same endpoint as hiding a visual. Rejecting a
// suggestion says the proposal was wrong; hiding says the section should show
// nothing. A teacher who says no to a see-saw has not decided the section
// stays bare forever, and one button doing both would put words in their
// mouth.

const MESSAGES: Record<string, string> = {
  not_allowed: "Only a teacher can do this.",
  not_found: "That section isn't in material you uploaded.",
};

export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Not configured for this deployment." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || !atLeast(user.role, "teacher")) {
    return NextResponse.json({ error: MESSAGES.not_allowed }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { chunkId?: string } | null;
  if (!body?.chunkId || typeof body.chunkId !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc("teacher_dismiss_visual_suggestion", { p_chunk_id: body.chunkId });
    if (error) throw error;

    const result = (data ?? {}) as { ok?: boolean; error?: string };
    if (!result.ok) {
      return NextResponse.json({ error: MESSAGES[result.error ?? ""] ?? "Couldn't save that." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    await reportError("ingest", err, "could not dismiss a visual suggestion");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
