import { createHook, FatalError } from "workflow";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { downloadCorpusFile } from "@/lib/supabase/storage";
import { extractDocument, isSupportedExtension } from "@/lib/ingestion/extract";
import { chunkExtractedText } from "@/lib/ingestion/chunk";

async function loadDocument(documentId: string) {
  "use step";
  const { data, error } = await supabaseAdmin()
    .from("corpus_documents")
    .select("id, source_file")
    .eq("id", documentId)
    .single();
  if (error || !data) throw new FatalError(`Document ${documentId} not found`);
  return data;
}

async function extractStep(sourceFile: string, storagePath: string) {
  "use step";
  const ext = sourceFile.split(".").pop()?.toLowerCase() ?? "";
  if (!isSupportedExtension(ext)) {
    throw new FatalError(`Unsupported file type: .${ext} (only .docx, .pdf, .pptx and .txt are supported today)`);
  }
  const buffer = await downloadCorpusFile(storagePath);
  return extractDocument(buffer, ext);
}

async function chunkStep(sourceFile: string, pages: { pageOrSection: number; text: string }[]) {
  "use step";
  return chunkExtractedText(sourceFile, pages);
}

async function savePendingChunks(
  documentId: string,
  sourceFile: string,
  chunks: { heading: string; text: string; pageOrSection: number }[],
) {
  "use step";
  const rows = chunks.map((c) => ({
    document_id: documentId,
    heading: c.heading,
    text: c.text,
    citation: `${sourceFile} — Page/Section ${c.pageOrSection}`,
  }));
  const { error } = await supabaseAdmin().from("corpus_chunks").insert(rows);
  if (error) throw error;
}

async function finalizeDocument(documentId: string, approved: boolean, reviewerId: string) {
  "use step";
  const admin = supabaseAdmin();
  await admin
    .from("corpus_documents")
    .update({ status: approved ? "approved" : "rejected" })
    .eq("id", documentId);

  if (approved) {
    await admin
      .from("corpus_chunks")
      .update({ approved_by: reviewerId, approved_at: new Date().toISOString() })
      .eq("document_id", documentId);
  } else {
    // Rejected chunks shouldn't linger as if they might still be used.
    await admin.from("corpus_chunks").delete().eq("document_id", documentId);
  }
}

// storagePath is passed explicitly rather than looked up from the row,
// since the API route that starts this workflow already has it at upload
// time — one less round-trip.
export async function ingestDocumentWorkflow(documentId: string, storagePath: string) {
  "use workflow";

  const doc = await loadDocument(documentId);
  const extracted = await extractStep(doc.source_file, storagePath);
  const chunks = await chunkStep(doc.source_file, extracted.pages);
  await savePendingChunks(documentId, doc.source_file, chunks);

  // Suspends here — costs nothing while waiting — until the teacher
  // approves or rejects via POST /api/ingest/review.
  const hook = createHook<{ approved: boolean; reviewerId: string }>({ token: `review:${documentId}` });
  const { approved, reviewerId } = await hook;

  await finalizeDocument(documentId, approved, reviewerId);

  return { documentId, approved };
}
