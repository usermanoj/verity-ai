import { generateText, Output } from "ai";
import { z } from "zod";
import { aiModel, gatewayFailover, STRUCTURED_FALLBACK_MODELS, mapAiCalls, withRateLimitRetry } from "@/lib/ai";
import type { ExtractedPage } from "./extract";

const ChunkSchema = z.object({
  heading: z
    .string()
    .describe("A short, descriptive heading naming the concept (e.g. 'Definition of a moment'), NOT the raw first line"),
  text: z
    .string()
    .describe(
      "The concept written as continuous prose a student can read, using only facts present in the source. Keep formulas, units and worked examples verbatim.",
    ),
  pageOrSection: z.number().describe("Which page/section number of the source document this chunk came from"),
  // nullable, not optional.
  //
  // OpenAI's strict structured outputs require every key in `properties` to
  // appear in `required`, and Zod's .optional() omits it — so this field
  // alone made every chunking call fail with "Missing 'module'". Anthropic
  // accepted the same schema, which is exactly why it only surfaced on
  // switching provider. A nullable field stays required and carries "no
  // value" explicitly, which both providers accept.
  module: z
    .string()
    .nullable()
    .describe(
      "The part of the lesson this concept belongs to, e.g. 'Magnetic materials' or 'Electromagnets'. Reuse the SAME wording for every chunk in that part.",
    ),
});

const ChunkingResultSchema = z.object({ chunks: z.array(ChunkSchema) });

export type AiChunk = z.infer<typeof ChunkSchema>;

// Slide decks are written to be *spoken over*: fragments, stray labels,
// repeated titles. Pasting that verbatim gave students something that read
// like a slide dump rather than a lesson — this prompt's job is to turn
// fragments into readable teaching text WITHOUT inventing anything, which is
// the same closed-corpus discipline the tutor itself follows.
const SYSTEM_PROMPT = [
  "You are helping a teacher prepare approved learning material for a closed-corpus AI tutor that cites sources exactly.",
  "Split the extracted document text into chunks — one concept per chunk — and write each so a student can read it on its own.",
  "",
  "Rules, in priority order:",
  "1. NEVER add facts, examples, numbers or explanations that are not present in the source text. If the source is thin, the chunk is short. Inventing content breaks the guarantee this product is built on.",
  "2. Reproduce formulas, quantities, units and worked examples EXACTLY as given — including every step of a worked solution.",
  "3. Rewrite fragments and bullet points into complete, connected sentences. Slide text is written to be spoken over, so it is often clipped; make it readable prose while preserving the meaning and terminology.",
  "4. Give each chunk a heading that names the concept ('Definition of a moment', 'Worked example: balancing a seesaw'). Do not simply repeat the chunk's first sentence as its heading.",
  "5. Drop slide furniture that teaches nothing: page numbers, deck titles, 'Any questions?', image credits, navigation labels.",
  "6. Merge consecutive pages covering one concept into a single chunk; split a page that genuinely covers two. Record the page/section number the chunk came from (the first, if merged).",
].join("\n");

// How many source pages/slides go into one model call. Chunking a whole deck
// in a single call meant the model had to *generate* every chunk one after
// another — a 35-slide deck produced 35 chunks of structured output
// sequentially, which is what a teacher sat through watching "Processing…".
// Token generation is the bottleneck, not comprehension, so the work splits
// cleanly across parallel calls: each batch is independent (chunks never span
// pages, and each carries its own source page number).
const PAGES_PER_BATCH = 16;

// Every format goes through the model now.
//
// PPTX briefly skipped it — a slide looked like a ready-made chunk, and
// removing the call collapsed a 30-60s wait. But the output was raw slide
// fragments with the title repeated as the body: fast and unreadable. The
// wait had other causes anyway (workflow dispatch, a top-tier model, a 21 MB
// server-side download), all since fixed, so the call now runs on
// already-extracted text, on the fast tier, in parallel batches.
//
// Routing inline-vs-workflow moved to upload-complete and now keys on whether
// the text is already extracted, which is what actually bounds the work.

// AI-assisted, not AI-decided: the model reorganises and clarifies text it is
// given, it never generates new claims — and a teacher approves every chunk
// before a student sees it.
export async function chunkExtractedText(sourceFileName: string, pages: ExtractedPage[]): Promise<AiChunk[]> {
  const batches: ExtractedPage[][] = [];
  for (let i = 0; i < pages.length; i += PAGES_PER_BATCH) {
    batches.push(pages.slice(i, i + PAGES_PER_BATCH));
  }

  // Batches are chunked in parallel and cannot see each other, so left to
  // themselves they each invent their own names for the same part of the
  // lesson — "Electromagnets", "Making electromagnets" and "Coils" would all
  // appear as separate modules. One cheap pass over the page openings fixes
  // the vocabulary first, and every batch then picks from that fixed list.
  const outline = await deriveOutline(sourceFileName, pages);

  const results = await mapAiCalls(batches, (batch) => chunkBatch(sourceFileName, batch, outline));

  // Restore document order: batches resolve in whatever order they finish,
  // but chunks must stay in reading order for the teacher's review.
  return results.flat().sort((a, b) => a.pageOrSection - b.pageOrSection);
}

// Five to eight parts, from the deck's own openings. Only the first couple of
// lines of each page go in, which keeps this call small and fast even for a
// long deck — naming the shape of a lesson doesn't need its full text.
async function deriveOutline(sourceFileName: string, pages: ExtractedPage[]): Promise<string[]> {
  const openings = pages
    .map((p) => `${p.pageOrSection}. ${p.text.split("\n").slice(0, 2).join(" — ").slice(0, 160)}`)
    .join("\n");

  try {
    const { output } = await withRateLimitRetry(() =>
      generateText({
      model: aiModel("chunk"),
      system: [
        "You are outlining a lesson from the titles of a teacher's slides.",
        "Name the 5-8 parts this lesson divides into, in teaching order.",
        "Each name is 2-4 words describing the concept ('Magnetic materials', 'Electromagnets', 'Magnetic fields').",
        "Use only what the slides are about — never add a part the deck does not cover.",
      ].join("\n"),
      prompt: `Source file: ${sourceFileName}\n\nSlide openings:\n${openings}`,
      output: Output.object({ schema: z.object({ modules: z.array(z.string()).min(1).max(10) }) }),
      providerOptions: gatewayFailover(STRUCTURED_FALLBACK_MODELS),
      }),
    );
    return output.modules;
  } catch {
    // Grouping is presentation. If the outline call fails the lesson still
    // has all its content and simply renders flat, which is what it did
    // before modules existed.
    return [];
  }
}

async function chunkBatch(sourceFileName: string, pages: ExtractedPage[], outline: string[]): Promise<AiChunk[]> {
  const pagesBlock = pages.map((p) => `--- Page/Section ${p.pageOrSection} ---\n${p.text}`).join("\n\n");
  const outlineBlock =
    outline.length > 0
      ? `\n\nThis lesson's parts, decided for the whole document. Set each chunk's "module" to EXACTLY one of these strings:\n${outline.map((m) => `- ${m}`).join("\n")}`
      : "";

  const { output } = await generateText({
    // Fast tier, not the primary model — see CHUNK_MODEL's rationale in
    // lib/ai.ts (mechanical rewriting + teacher reviews every chunk anyway).
    model: aiModel("chunk"),
    system: SYSTEM_PROMPT,
    prompt: `Source file: ${sourceFileName}${outlineBlock}\n\n${pagesBlock}`,
    output: Output.object({ schema: ChunkingResultSchema }),
    providerOptions: gatewayFailover(STRUCTURED_FALLBACK_MODELS),
  });

  // A batch can still drift off the agreed vocabulary. Anything not on the
  // list is dropped rather than allowed to become a module of one, since a
  // near-miss name ("Electromagnet" vs "Electromagnets") would split a part
  // in two on the page.
  if (outline.length === 0) return output.chunks.map((c) => ({ ...c, module: null }));
  const allowed = new Map(outline.map((m) => [m.toLowerCase().trim(), m]));
  return output.chunks.map((c) => ({ ...c, module: allowed.get((c.module ?? "").toLowerCase().trim()) ?? null }));
}
