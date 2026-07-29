import { supabaseAdmin } from "@/lib/supabase/admin";
import { mapAiCalls, hasApiKey } from "@/lib/ai";
import { contentRepo } from "@/lib/content-repo";
import { hasBlockingIssue } from "./checks";
import { lookupTranslation, rememberTranslation } from "./memory";
import { translatePassage } from "./translate";

// Translate a whole deck when the teacher approves it.
//
// Corrections used to be reactive: a passage only appeared for review after a
// student had already been shown the model's version of it. For anything a
// school is accountable for, that is the wrong way round — the teacher should
// see the Chinese first.
//
// So approval now also fills the translation memory for every section. By the
// time the material reaches a student, the Chinese exists, has passed the
// quality checks, and is sitting in Teacher → Language waiting to be read.
//
// Never throws. The document is already approved and perfectly usable in
// English; a failed translation pass must not undo that, and a teacher who
// approved a deck should not see an error about work they did not ask for.

// A deck is bounded work, but a 40-section one is still 40 model calls. This
// is the same limiter the question generation uses, for the same reason: the
// free-tier rate limits are real and a burst of forty gets throttled.
const MAX_SECTIONS = 60;

export async function translateDocument(documentId: string): Promise<void> {
  if (!hasApiKey()) return;

  try {
    const admin = supabaseAdmin();
    const { data: chunks, error } = await admin
      .from("corpus_chunks")
      .select("id, text")
      .eq("document_id", documentId)
      .order("created_at", { ascending: true })
      .limit(MAX_SECTIONS);
    if (error) {
      console.error(`[translate/batch] could not read chunks for ${documentId}:`, error);
      return;
    }
    if (!chunks?.length) return;

    // This document's own vocabulary, so the batch and the student's Translate
    // button agree on terminology.
    const glossary = await contentRepo.getGlossary(documentId);

    let written = 0;
    let skipped = 0;
    let rejected = 0;

    await mapAiCalls(chunks, async (chunk) => {
      const text = (chunk.text ?? "").trim();
      // Headings and one-line slides are not worth a call, and a translation
      // of three words is not something a teacher needs to review.
      if (text.length < 40) return;

      // Idempotent: re-approving a document, or approving one whose sections
      // a student already translated, must not pay for the same passage twice
      // — and must never overwrite a teacher's correction.
      if (await lookupTranslation(text, documentId)) {
        skipped += 1;
        return;
      }

      const { text: translation, issues } = await translatePassage(text, glossary);
      if (hasBlockingIssue(issues)) {
        // Not stored. A cache that serves the same fault to every future
        // student, quickly and for free, is the worst thing a cache can be.
        rejected += 1;
        return;
      }
      await rememberTranslation(text, translation, documentId);
      written += 1;
    });

    console.log(
      `[translate/batch] ${documentId}: ${written} translated, ${skipped} already stored, ${rejected} rejected by checks`,
    );
  } catch (err) {
    console.error(`[translate/batch] failed for ${documentId}:`, err);
  }
}
