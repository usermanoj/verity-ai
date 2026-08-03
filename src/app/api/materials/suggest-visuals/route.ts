import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { hasSupabase } from "@/lib/supabase/config";
import { hasSupabaseAdmin, supabaseAdmin } from "@/lib/supabase/admin";
import { reportError } from "@/lib/errors/report";
import { claimAiCall } from "@/lib/ai-usage";
import { hasApiKey } from "@/lib/ai";
import { suggestVisualsForDocument } from "@/lib/visuals/run";

export const runtime = "nodejs";
// A deck of thirty sections is one model call, but a slow one.
export const maxDuration = 60;

// Asking again, on demand.
//
// The pass now runs by itself when a document is approved (see
// api/ingest/review), so this is the second bite: material approved before the
// feature existed, a deck whose sections have changed, or a teacher who wants
// another look after dismissing something.
//
// Nothing here changes a lesson. Suggestions go to their own table, which no
// student can read, and reach a child only when the teacher accepts one.
//
// Ownership is checked before the model is called, not after. The check is
// free and the call is not.

export async function POST(req: NextRequest) {
  if (!hasSupabase() || !hasSupabaseAdmin()) {
    return NextResponse.json({ error: "Not configured for this deployment." }, { status: 503 });
  }
  if (!hasApiKey()) {
    return NextResponse.json({ error: "No AI provider is configured for this deployment." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || !atLeast(user.role, "teacher")) {
    return NextResponse.json({ error: "Only a teacher can do this." }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { documentId?: string } | null;
  if (!body?.documentId || typeof body.documentId !== "string") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    // Their own upload. Same rule as teacher_set_section_visual: being senior
    // does not make a colleague's lesson yours to redecorate.
    const { data: doc, error } = await supabaseAdmin()
      .from("corpus_documents")
      .select("id")
      .eq("id", body.documentId)
      .eq("uploaded_by", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!doc) return NextResponse.json({ error: "That isn't material you uploaded." }, { status: 404 });

    // Counted only against a person who asked for it. The automatic run at
    // approval does not claim — see suggestVisualsForDocument.
    const claim = await claimAiCall("suggest");
    if (!claim.verdict.allowed) {
      return NextResponse.json(
        { error: "Today's AI budget for this school is used up. This will work again tomorrow." },
        { status: 429 },
      );
    }

    const { considered, proposed, stored } = await suggestVisualsForDocument(body.documentId);
    // `proposed` is not decoration. Without it, suggested: 0 means either the
    // model had no opinion or it had four and the filter took all of them, and
    // those call for opposite fixes.
    return NextResponse.json({ ok: true, suggested: stored, proposed, considered });
  } catch (err) {
    await reportError("ingest", err, "could not suggest visuals for a document");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
