import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";
import { reportError } from "@/lib/errors/report";
import { VISUAL_IDS } from "@/lib/visuals/catalogue";

export const runtime = "nodejs";

// Choosing a section's interactive.
//
// Three states, and the request has to be able to express all three — see
// lib/visuals/resolve.ts for why "hide it" cannot be folded into "automatic".
//
//   { visual: "lever" }   show this one
//   { visual: null }      show nothing here
//   { automatic: true }   forget my choice, go back to matching
//
// Ownership is decided inside teacher_set_section_visual against auth.uid().
// This route does not re-derive it.

const MESSAGES: Record<string, string> = {
  not_allowed: "Only a teacher can change a lesson's illustrations.",
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

  const body = (await req.json().catch(() => null)) as
    | { chunkId?: string; visual?: string | null; automatic?: boolean }
    | null;
  if (!body?.chunkId || typeof body.chunkId !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const automatic = body.automatic === true;
  const visual = automatic ? null : (body.visual ?? null);

  // Checked against the registry so a typo cannot be stored. An unknown id
  // would resolve to no picture at all, which looks exactly like "hidden" and
  // would leave a teacher unable to work out why their choice did nothing.
  if (!automatic && visual !== null && !(VISUAL_IDS as readonly string[]).includes(visual)) {
    return NextResponse.json({ error: "That isn't one of the illustrations." }, { status: 400 });
  }

  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc("teacher_set_section_visual", {
      p_chunk_id: body.chunkId,
      p_visual: visual,
      p_explicit: !automatic,
    });
    if (error) throw error;

    const result = (data ?? {}) as { ok?: boolean; error?: string; state?: string };
    if (!result.ok) {
      return NextResponse.json({ error: MESSAGES[result.error ?? ""] ?? "Couldn't save that." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, state: result.state });
  } catch (err) {
    await reportError("ingest", err, "could not set a section's visual");
    return NextResponse.json({ error: "Something went wrong saving that. Please try again." }, { status: 500 });
  }
}
