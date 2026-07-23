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

// AI-assisted, not AI-decided: the model splits and lightly cleans text it
// is given, it never generates new claims — the same "closed-corpus"
// discipline as the tutor itself, applied to ingestion.
export async function chunkExtractedText(sourceFileName: string, pages: ExtractedPage[]): Promise<AiChunk[]> {
  const pagesBlock = pages.map((p) => `--- Page/Section ${p.pageOrSection} ---\n${p.text}`).join("\n\n");

  const { output } = await generateText({
    // Fast tier, not the primary model — see CHUNK_MODEL's rationale in
    // lib/ai.ts (mechanical extraction + teacher reviews every chunk anyway).
    model: CHUNK_MODEL,
    system:
      "You are helping a teacher prepare approved learning material for a closed-corpus AI tutor that must cite " +
      "sources exactly. Split the following extracted document text into logical chunks — one topic or concept per " +
      "chunk. Faithfully preserve the original wording and meaning; do not summarize, add, or infer information " +
      "that is not present in the text. Record which page/section number each chunk came from.",
    prompt: `Source file: ${sourceFileName}\n\n${pagesBlock}`,
    output: Output.object({ schema: ChunkingResultSchema }),
    providerOptions: { gateway: { models: GATEWAY_FALLBACK_MODELS } },
  });

  return output.chunks;
}
