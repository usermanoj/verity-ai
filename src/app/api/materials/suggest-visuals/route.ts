import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { hasSupabase } from "@/lib/supabase/config";
import { hasSupabaseAdmin, supabaseAdmin } from "@/lib/supabase/admin";
import { reportError } from "@/lib/errors/report";
import { claimAiCall } from "@/lib/ai-usage";
import { hasApiKey } from "@/lib/ai";
import { contentRepo } from "@/lib/content-repo";
import { pageOf } from "@/lib/lesson/page-of";
import { VISUALS, VISUAL_IDS, assignVisuals } from "@/lib/visuals/catalogue";
import { dedupe, resolveVisuals } from "@/lib/visuals/resolve";
import { sectionsNeedingSuggestion } from "@/lib/visuals/suggest";
import { proposeVisuals } from "@/lib/visuals/propose";

export const runtime = "nodejs";
// A deck of thirty sections is one model call, but a slow one.
export const maxDuration = 60;

// Asking the model what the bare sections could be illustrated with.
//
// Nothing here changes a lesson. Suggestions go into their own table
// (section_visual_suggestions, 0045) which no student can read, and become
// visible to a child only if the teacher accepts one through the picker. That
// is the whole point of the feature and the reason it is two tables.
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
  const documentId = body.documentId;

  try {
    const db = supabaseAdmin();

    // Their own upload. Same rule as teacher_set_section_visual: being senior
    // does not make a colleague's lesson yours to redecorate.
    const { data: doc, error: docError } = await db
      .from("corpus_documents")
      .select("id")
      .eq("id", documentId)
      .eq("uploaded_by", user.id)
      .maybeSingle();
    if (docError) throw docError;
    if (!doc) {
      return NextResponse.json({ error: "That isn't material you uploaded." }, { status: 404 });
    }

    const [chunks, media] = await Promise.all([
      contentRepo.getCorpusForTopic(documentId),
      contentRepo.getMediaForTopic(documentId),
    ]);
    if (chunks.length === 0) {
      return NextResponse.json({ error: "That material has no sections yet." }, { status: 400 });
    }

    const [{ data: overrideRows, error: overrideError }, { data: existing, error: existingError }] = await Promise.all([
      db.from("section_visuals").select("chunk_id, visual").in("chunk_id", chunks.map((c) => c.id)),
      db.from("section_visual_suggestions").select("chunk_id").in("chunk_id", chunks.map((c) => c.id)),
    ]);
    if (overrideError) throw overrideError;
    if (existingError) throw existingError;

    // Recomputed here rather than taken from the client, so what the model is
    // asked about is what the lesson actually renders. The two must agree or
    // the teacher gets offered a picture for a section that already has one.
    const matched = assignVisuals(
      chunks.map((c) => {
        const heading = c.heading?.trim() ?? "";
        const figures = (media.get(pageOf(c.source)) ?? []).filter((m) => m.kind !== "slide");
        return { heading, text: c.text.trim() === heading ? "" : c.text, hasMedia: figures.length > 0 };
      }),
    );
    const resolved = dedupe(
      resolveVisuals(
        chunks.map((c) => c.id),
        matched,
        (overrideRows ?? []).map((r) => ({ chunkId: r.chunk_id as string, visual: (r.visual as string | null) ?? null })),
        VISUAL_IDS,
      ),
    );

    // Already asked about, whether or not the teacher said yes. A section they
    // rejected must not be proposed again, and one they have not answered yet
    // does not need a second opinion.
    const asked = new Set((existing ?? []).map((r) => r.chunk_id as string));
    const eligible = sectionsNeedingSuggestion(
      chunks.map((c) => ({ chunkId: c.id, heading: c.heading?.trim() ?? "", text: c.text })),
      resolved,
    ).filter((s) => !asked.has(s.chunkId));

    if (eligible.length === 0) {
      return NextResponse.json({ ok: true, suggested: 0, considered: 0 });
    }

    // Counted only now, because everything above can refuse for free and a
    // teacher should not spend a call to be told there was nothing to do.
    const claim = await claimAiCall("suggest");
    if (!claim.verdict.allowed) {
      return NextResponse.json(
        { error: "Today's AI budget for this school is used up. This will work again tomorrow." },
        { status: 429 },
      );
    }

    const { suggestions, model } = await proposeVisuals(
      eligible,
      VISUALS,
      resolved.map((r) => r.visual).filter((v): v is string => v !== null),
    );

    if (suggestions.length > 0) {
      const { error: writeError } = await db.from("section_visual_suggestions").upsert(
        suggestions.map((s) => ({ chunk_id: s.chunkId, visual: s.visual, reason: s.reason, model })),
        { onConflict: "chunk_id" },
      );
      if (writeError) throw writeError;
    }

    return NextResponse.json({ ok: true, suggested: suggestions.length, considered: eligible.length });
  } catch (err) {
    await reportError("ingest", err, "could not suggest visuals for a document");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
