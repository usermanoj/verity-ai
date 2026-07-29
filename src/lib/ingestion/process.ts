import { supabaseAdmin } from "@/lib/supabase/admin";
import { downloadCorpusFile } from "@/lib/supabase/storage";
import { extractDocument, isSupportedExtension } from "./extract";
import { chunkExtractedText } from "./chunk";
import { generateGlossary } from "./glossary";

export class UnsupportedFileError extends Error {}
export class DocumentNotFoundError extends Error {}

// Extract → chunk → save. Shared by both ingestion paths: called inline from
// the request for formats that need no model call, and from inside the
// durable workflow's single step for those that do.
//
// `prextractedPages` lets the caller supply the text the browser already
// pulled out of the file, which skips downloading it back out of Storage
// entirely — that download was most of the 3023ms "process" phase measured
// on a 15.8 MB deck, and at scale it means a serverless function no longer
// holds every uploaded file in memory. Only offered for formats whose
// extraction is deterministic and client-safe (PPTX); the original file is
// still stored, so provenance is unaffected, and every chunk is reviewed by
// the teacher before a student sees it.
export async function extractAndSaveChunks(
  documentId: string,
  storagePath: string,
  preextractedPages?: { pageOrSection: number; text: string }[],
): Promise<number> {
  const admin = supabaseAdmin();

  const { data: doc, error: docError } = await admin
    .from("corpus_documents")
    .select("id, source_file")
    .eq("id", documentId)
    .single();
  if (docError || !doc) throw new DocumentNotFoundError(`Document ${documentId} not found`);

  const ext = doc.source_file.split(".").pop()?.toLowerCase() ?? "";
  if (!isSupportedExtension(ext)) {
    throw new UnsupportedFileError(
      `Unsupported file type: .${ext} (only .docx, .pdf, .pptx and .txt are supported today)`,
    );
  }

  const pages =
    preextractedPages && preextractedPages.length > 0
      ? preextractedPages
      : (await extractDocument(await downloadCorpusFile(storagePath), ext)).pages;

  const chunks = await chunkExtractedText(doc.source_file, pages);

  const rows = chunks.map((c) => ({
    document_id: documentId,
    heading: c.heading,
    text: c.text,
    citation: `${doc.source_file} — Page/Section ${c.pageOrSection}`,
    module: c.module ?? null,
  }));
  if (rows.length === 0) return 0;

  const { error } = await admin.from("corpus_chunks").insert(rows);
  if (error) throw error;

  await saveGlossary(documentId, doc.source_file, chunks);

  return rows.length;
}

// Vocabulary for THIS document, from its own text.
//
// Awaited rather than fired off, so the terms are in place before the teacher
// can approve the document and a student can open it — a glossary that
// arrives after the first reader is a glossary that looks broken.
//
// Never throws. A rate-limited extra model call must not fail an upload whose
// chunks are already saved: the lesson reads perfectly well without underlined
// words, and re-ingesting to recover a glossary would cost far more than the
// glossary is worth.
async function saveGlossary(
  documentId: string,
  sourceFile: string,
  chunks: { heading: string | null; text: string }[],
): Promise<void> {
  try {
    const text = chunks.map((c) => [c.heading, c.text].filter(Boolean).join(": ")).join("\n\n");
    const terms = await generateGlossary(sourceFile, text);
    if (terms.length === 0) return;

    const { error } = await supabaseAdmin()
      .from("corpus_glossary")
      .insert(terms.map((t) => ({ document_id: documentId, term: t.term, en: t.en, zh: t.zh })));
    if (error) console.error(`[glossary] could not save terms for ${sourceFile}:`, error);
  } catch (err) {
    console.error(`[glossary] skipped for ${sourceFile}:`, err);
  }
}
