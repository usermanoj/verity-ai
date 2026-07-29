import { createHash } from "node:crypto";
import { hasSupabaseAdmin, supabaseAdmin } from "@/lib/supabase/admin";

// Translation memory: every passage translated once, and correctable.
//
// Translation already runs at temperature 0, so the same English always
// produces the same Chinese — and was paid for on every single tap. Storing it
// makes repeats free and instant.
//
// The larger reason is corrections. A teacher who fixes a passage needs the
// fix to reach students, and this is where it lives: a 'teacher' entry always
// wins over the model's, for that passage, from then on.

export const DEFAULT_TARGET_LANG = "zh-Hans";

/**
 * Key for a passage.
 *
 * Normalised first, so trailing whitespace or a re-wrapped line doesn't miss a
 * cache entry — and, more importantly, doesn't orphan a teacher's correction
 * from the passage they corrected.
 */
export function sourceHash(text: string): string {
  const normalised = text.trim().replace(/\s+/g, " ");
  return createHash("sha256").update(normalised).digest("hex");
}

export type MemoryHit = { translation: string; origin: "model" | "teacher" };

/**
 * Looks up a stored translation.
 *
 * Read with the service role, like every other content read: a student must
 * see a teacher's correction, and they have no rights over the row that holds
 * it. Never throws — a memory that is down should slow translation, not break
 * it.
 */
export async function lookupTranslation(
  text: string,
  documentId: string | null,
  targetLang = DEFAULT_TARGET_LANG,
): Promise<MemoryHit | null> {
  if (!hasSupabaseAdmin()) return null;
  try {
    const query = supabaseAdmin()
      .from("translation_memory")
      .select("translation, origin")
      .eq("source_hash", sourceHash(text))
      .eq("target_lang", targetLang);

    const { data, error } = documentId
      ? await query.eq("document_id", documentId).maybeSingle()
      : await query.is("document_id", null).maybeSingle();

    if (error || !data) return null;
    return { translation: data.translation as string, origin: data.origin as MemoryHit["origin"] };
  } catch (err) {
    console.error("[translate/memory] lookup failed:", err);
    return null;
  }
}

/**
 * Stores a model translation.
 *
 * Deliberately does NOT overwrite an existing row: the one already there may
 * be a teacher's correction, and silently replacing it with the model's
 * opinion would undo their work on the next student's tap.
 */
export async function rememberTranslation(
  text: string,
  translation: string,
  documentId: string | null,
  targetLang = DEFAULT_TARGET_LANG,
): Promise<void> {
  if (!hasSupabaseAdmin() || !translation.trim()) return;
  try {
    const { error } = await supabaseAdmin()
      .from("translation_memory")
      .insert({
        document_id: documentId,
        source_hash: sourceHash(text),
        source_text: text,
        target_lang: targetLang,
        translation,
        origin: "model",
      });
    // A unique-violation means something is already stored for this passage,
    // which is the outcome we want — not an error worth logging.
    if (error && error.code !== "23505") {
      console.error("[translate/memory] could not store translation:", error);
    }
  } catch (err) {
    console.error("[translate/memory] store threw:", err);
  }
}
