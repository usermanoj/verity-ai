import { generateText, Output } from "ai";
import { z } from "zod";
import { CHUNK_MODEL, GATEWAY_FALLBACK_MODELS } from "@/lib/ai";
import type { ExtractedPage } from "./extract";

const ChunkSchema = z.object({
  heading: z.string().describe("A short, descriptive heading for this chunk (e.g. 'What is a moment?')"),
  text: z
    .string()
    .describe("The chunk's content, faithfully extracted/lightly cleaned — never add information not present in the source"),
  pageOrSection: z.number().describe("Which page/section number of the source document this chunk came from"),
});

const ChunkingResultSchema = z.object({ chunks: z.array(ChunkSchema) });

export type AiChunk = z.infer<typeof ChunkSchema>;

const SYSTEM_PROMPT =
  "You are helping a teacher prepare approved learning material for a closed-corpus AI tutor that must cite " +
  "sources exactly. Split the following extracted document text into logical chunks — one topic or concept per " +
  "chunk. Faithfully preserve the original wording and meaning; do not summarize, add, or infer information " +
  "that is not present in the text. Record which page/section number each chunk came from.";

// How many source pages/slides go into one model call. Chunking a whole deck
// in a single call meant the model had to *generate* every chunk one after
// another — a 35-slide deck produced 35 chunks of structured output
// sequentially, which is what a teacher sat through watching "Processing…".
// Token generation is the bottleneck, not comprehension, so the work splits
// cleanly across parallel calls: each batch is independent (chunks never span
// pages, and each carries its own source page number).
const PAGES_PER_BATCH = 8;

// AI-assisted, not AI-decided: the model splits and lightly cleans text it
// is given, it never generates new claims — the same "closed-corpus"
// discipline as the tutor itself, applied to ingestion.
export async function chunkExtractedText(sourceFileName: string, pages: ExtractedPage[]): Promise<AiChunk[]> {
  const ext = sourceFileName.split(".").pop()?.toLowerCase();

  // PPTX: each slide is authored as a discrete topic with its own title, so
  // it is ALREADY a chunk. Skip the model entirely — no network call at all.
  // This is both far faster (a slide deck was the whole "Processing…" wait)
  // and *better* chunking than asking a model to re-derive boundaries the
  // deck already defines. The teacher reviews every chunk regardless, so a
  // rare over-long slide is caught. Prose formats (DOCX/TXT = one big block;
  // PDF = layout pages that don't map cleanly to concepts) have no such
  // natural boundaries and still need the model.
  if (ext === "pptx") {
    return pages.map((p) => ({
      heading: deriveHeading(p.text),
      text: p.text.trim(),
      pageOrSection: p.pageOrSection,
    }));
  }

  const batches: ExtractedPage[][] = [];
  for (let i = 0; i < pages.length; i += PAGES_PER_BATCH) {
    batches.push(pages.slice(i, i + PAGES_PER_BATCH));
  }

  const results = await Promise.all(batches.map((batch) => chunkBatch(sourceFileName, batch)));

  // Restore document order: batches resolve in whatever order they finish,
  // but chunks must stay in reading order for the teacher's review.
  return results.flat().sort((a, b) => a.pageOrSection - b.pageOrSection);
}

// A slide's heading is its title — reliably the first non-empty line, since
// that's where slide layouts put it. Capped so a title-less slide (whose
// first line is body text) still yields a sane label.
function deriveHeading(slideText: string): string {
  const firstLine = slideText
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!firstLine) return "Slide";
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

async function chunkBatch(sourceFileName: string, pages: ExtractedPage[]): Promise<AiChunk[]> {
  const pagesBlock = pages.map((p) => `--- Page/Section ${p.pageOrSection} ---\n${p.text}`).join("\n\n");

  const { output } = await generateText({
    // Fast tier, not the primary model — see CHUNK_MODEL's rationale in
    // lib/ai.ts (mechanical extraction + teacher reviews every chunk anyway).
    model: CHUNK_MODEL,
    system: SYSTEM_PROMPT,
    prompt: `Source file: ${sourceFileName}\n\n${pagesBlock}`,
    output: Output.object({ schema: ChunkingResultSchema }),
    providerOptions: { gateway: { models: GATEWAY_FALLBACK_MODELS } },
  });

  return output.chunks;
}
