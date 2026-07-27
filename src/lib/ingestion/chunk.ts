import { generateText, Output } from "ai";
import { z } from "zod";
import { CHUNK_MODEL, GATEWAY_FALLBACK_MODELS } from "@/lib/ai";
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
const PAGES_PER_BATCH = 8;

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

  const results = await Promise.all(batches.map((batch) => chunkBatch(sourceFileName, batch)));

  // Restore document order: batches resolve in whatever order they finish,
  // but chunks must stay in reading order for the teacher's review.
  return results.flat().sort((a, b) => a.pageOrSection - b.pageOrSection);
}

async function chunkBatch(sourceFileName: string, pages: ExtractedPage[]): Promise<AiChunk[]> {
  const pagesBlock = pages.map((p) => `--- Page/Section ${p.pageOrSection} ---\n${p.text}`).join("\n\n");

  const { output } = await generateText({
    // Fast tier, not the primary model — see CHUNK_MODEL's rationale in
    // lib/ai.ts (mechanical rewriting + teacher reviews every chunk anyway).
    model: CHUNK_MODEL,
    system: SYSTEM_PROMPT,
    prompt: `Source file: ${sourceFileName}\n\n${pagesBlock}`,
    output: Output.object({ schema: ChunkingResultSchema }),
    providerOptions: { gateway: { models: GATEWAY_FALLBACK_MODELS } },
  });

  return output.chunks;
}
