import { Output, generateText } from "ai";
import { z } from "zod";
import { aiModel, gatewayFailover, STRUCTURED_FALLBACK_MODELS } from "@/lib/ai";
import { hasLangfuse } from "@/lib/observability";

// The ESL vocabulary of one uploaded document, extracted from its own text.
//
// This replaces a hand-written 14-term list that only ever matched the two
// demo topics. A glossary that has to be authored per subject doesn't scale
// past a demo, and its failure mode is silent: the words simply stop being
// underlined and nobody can tell whether the feature is off or the document
// is easy.
//
// Deliberately NOT a dictionary of every hard word. A tooltip on every third
// word is noise a student learns to ignore; the aim is the terms that carry
// the lesson's meaning and that an ESL reader genuinely cannot infer.

export type GlossaryEntry = { term: string; en: string; zh: string };

// Flat strings, all required. OpenAI's strict structured mode rejects
// optional keys (every property in `properties` must appear in `required`),
// which is why nothing here is .optional() — see lib/ai.ts.
const EntrySchema = z.object({
  term: z.string().describe("The word or short phrase exactly as it appears in the document"),
  en: z.string().describe("A plain-English definition in under 15 words, no jargon"),
  zh: z.string().describe("Simplified Chinese gloss, with a short parenthetical explanation"),
});

const MIN_TERM_LEN = 3;
const MAX_TERMS = 30;

// Terms shorter than a few characters, or that are ordinary English, produce
// tooltips that insult the reader ("is", "the"). The model is told to avoid
// them; this is the belt to that braces.
const TOO_COMMON = new Set([
  "the", "and", "but", "for", "with", "this", "that", "they", "them", "you", "your", "are", "was",
  "can", "will", "not", "use", "used", "make", "made", "when", "then", "than", "into", "from",
]);

export function sanitiseGlossary(entries: GlossaryEntry[]): GlossaryEntry[] {
  const seen = new Set<string>();
  const out: GlossaryEntry[] = [];
  for (const e of entries) {
    const term = e.term.trim();
    const key = term.toLowerCase();
    // The unique index is on (document_id, lower(term)); de-duplicating here
    // means one repeated term can't fail the whole insert.
    if (!term || seen.has(key)) continue;
    if (term.length < MIN_TERM_LEN || TOO_COMMON.has(key)) continue;
    // A "term" that is really a sentence can't be highlighted in prose.
    if (term.split(/\s+/).length > 4) continue;
    if (!e.en.trim() || !e.zh.trim()) continue;
    seen.add(key);
    out.push({ term, en: e.en.trim(), zh: e.zh.trim() });
    if (out.length >= MAX_TERMS) break;
  }
  return out;
}

/**
 * Extracts the key vocabulary from a document's chunked text.
 *
 * Returns [] rather than throwing on any failure: a glossary is an aid, and
 * an upload that otherwise succeeded must not be failed because the extra
 * model call was rate-limited. The lesson is still perfectly readable without
 * underlined words.
 */
export async function generateGlossary(sourceFile: string, text: string): Promise<GlossaryEntry[]> {
  // One call over a trimmed sample of the document. The vocabulary of a deck
  // is repetitive by nature, so the opening sections carry nearly all of it —
  // and this keeps a 40-slide upload to a single, bounded request.
  const sample = text.slice(0, 12_000);
  if (sample.trim().length < 200) return [];

  try {
    const { experimental_output: output } = await generateText({
      model: aiModel("question"),
      maxOutputTokens: 2_000,
      output: Output.object({ schema: z.object({ terms: z.array(EntrySchema) }) }),
      system:
        "You build vocabulary lists for English-as-a-Second-Language students at an international school. " +
        "The students are around 12 years old and read English as a second language; their first language is Chinese.",
      prompt:
        `From the lesson material below (from "${sourceFile}"), list the 15-25 words or short phrases an ESL student ` +
        `must understand to follow this lesson.\n\n` +
        `Rules:\n` +
        `- Choose SUBJECT vocabulary and terms whose everyday meaning differs from their meaning here. ` +
        `Skip ordinary English a 12-year-old already knows.\n` +
        `- Use each term exactly as it is written in the material, so it can be found in the text. Singular, lower case.\n` +
        `- Definitions must be under 15 words, in simple English, and must NOT reuse the term itself.\n` +
        `- The Chinese gloss is the standard term plus a short explanation in brackets, e.g. "磁场（磁铁周围能产生作用力的空间）".\n` +
        `- Take the meaning from THIS material, not from general knowledge.\n\n` +
        `MATERIAL:\n${sample}`,
      experimental_telemetry: { isEnabled: hasLangfuse(), functionId: "glossary" },
      providerOptions: gatewayFailover(STRUCTURED_FALLBACK_MODELS),
    });
    return sanitiseGlossary(output?.terms ?? []);
  } catch (err) {
    // Logged, not swallowed silently — the whole reason the old glossary went
    // unnoticed for weeks is that its absence looked exactly like success.
    console.error(`[glossary] extraction failed for ${sourceFile}:`, err);
    return [];
  }
}
