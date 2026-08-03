import { supabaseAdmin } from "@/lib/supabase/admin";
import { contentRepo } from "@/lib/content-repo";
import { pageOf } from "@/lib/lesson/page-of";
import { VISUALS, VISUAL_IDS, assignVisuals } from "./catalogue";
import { dedupe, resolveVisuals } from "./resolve";
import { sectionsNeedingSuggestion } from "./suggest";
import { proposeVisuals } from "./propose";

// Running the suggestion pass over a whole deck.
//
// One function, two callers: the teacher's button and the moment a document is
// approved. They must not drift — a button that considers different sections
// from the automatic run is a button that appears to do nothing.
//
// The automatic call is the point of this file. Everything deterministic
// already populates itself on every render: the matching rules choose
// interactives, and a data table draws itself as a graph. Only the AI half
// needed a human to start it, which meant material approved before anyone
// thought to press the button stayed bare forever.

export type RunResult = {
  /** Sections matching left bare and nobody has ruled on yet. */
  considered: number;
  /** What the model returned, before filtering. */
  proposed: number;
  /** What survived and was stored. */
  stored: number;
};

/**
 * Proposes interactives for the bare sections of one document.
 *
 * Writes to section_visual_suggestions, which no student can read. Nothing
 * here changes a lesson: a suggestion becomes visible to a child only when the
 * teacher accepts it.
 *
 * Deliberately does not claim against the per-person AI budget. This is one
 * call per approved deck, not per section and not per student action, so it is
 * bounded by how often a teacher uploads — and making it fail on a budget
 * refusal would mean a deck silently approved with nothing proposed and no way
 * to tell why.
 */
export async function suggestVisualsForDocument(documentId: string): Promise<RunResult> {
  const db = supabaseAdmin();

  const [chunks, media] = await Promise.all([
    contentRepo.getCorpusForTopic(documentId),
    contentRepo.getMediaForTopic(documentId),
  ]);
  if (chunks.length === 0) return { considered: 0, proposed: 0, stored: 0 };

  const ids = chunks.map((c) => c.id);
  const [overrides, existing] = await Promise.all([
    db.from("section_visuals").select("chunk_id, visual").in("chunk_id", ids),
    db.from("section_visual_suggestions").select("chunk_id").in("chunk_id", ids),
  ]);
  if (overrides.error) throw overrides.error;
  if (existing.error) throw existing.error;

  // Recomputed from the corpus rather than taken from a caller, so what the
  // model is asked about is exactly what the lesson renders.
  const matched = assignVisuals(
    chunks.map((c) => {
      const heading = c.heading?.trim() ?? "";
      const figures = (media.get(pageOf(c.source)) ?? []).filter((m) => m.kind !== "slide");
      return { heading, text: c.text.trim() === heading ? "" : c.text, hasMedia: figures.length > 0 };
    }),
  );
  const resolved = dedupe(
    resolveVisuals(
      ids,
      matched,
      (overrides.data ?? []).map((r) => ({
        chunkId: r.chunk_id as string,
        visual: (r.visual as string | null) ?? null,
      })),
      VISUAL_IDS,
    ),
  );

  // Already asked about, whether or not the teacher said yes. A section they
  // rejected must never be proposed again.
  const asked = new Set((existing.data ?? []).map((r) => r.chunk_id as string));
  const eligible = sectionsNeedingSuggestion(
    chunks.map((c) => ({ chunkId: c.id, heading: c.heading?.trim() ?? "", text: c.text })),
    resolved,
  ).filter((s) => !asked.has(s.chunkId));

  if (eligible.length === 0) return { considered: 0, proposed: 0, stored: 0 };

  const { suggestions, proposed, model } = await proposeVisuals(
    eligible,
    VISUALS,
    resolved.map((r) => r.visual).filter((v): v is string => v !== null),
  );

  if (suggestions.length > 0) {
    const { error } = await db.from("section_visual_suggestions").upsert(
      suggestions.map((s) => ({ chunk_id: s.chunkId, visual: s.visual, reason: s.reason, model })),
      { onConflict: "chunk_id" },
    );
    if (error) throw error;
  }

  return { considered: eligible.length, proposed, stored: suggestions.length };
}
