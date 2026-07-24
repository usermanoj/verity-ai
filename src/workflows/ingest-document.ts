import { createHook, FatalError } from "workflow";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { downloadCorpusFile } from "@/lib/supabase/storage";
import { extractDocument, isSupportedExtension } from "@/lib/ingestion/extract";
import { chunkExtractedText } from "@/lib/ingestion/chunk";

// Load, extract, chunk and save as ONE durable step rather than four.
//
// Every "use step" is a checkpoint: the engine persists state and re-invokes
// between them, so four steps meant four orchestration round trips before a
// teacher saw any chunks. For a .pptx that cost dominated the wait entirely —
// slides now skip the model, so the real work here (download, unzip, insert)
// is well under a second.
//
// The trade-off is retry granularity: a failure re-runs the whole step
// instead of resuming mid-way. That's the right trade for work this short,
// and it also avoids the half-finished states the split version could leave
// (extracted but not saved).
async function extractAndSaveChunks(documentId: string, storagePath: string) {
  "use step";
  const admin = supabaseAdmin();

  const { data: doc, error: docError } = await admin
    .from("corpus_documents")
    .select("id, source_file")
    .eq("id", documentId)
    .single();
  if (docError || !doc) throw new FatalError(`Document ${documentId} not found`);

  const ext = doc.source_file.split(".").pop()?.toLowerCase() ?? "";
  if (!isSupportedExtension(ext)) {
    throw new FatalError(`Unsupported file type: .${ext} (only .docx, .pdf, .pptx and .txt are supported today)`);
  }

  const buffer = await downloadCorpusFile(storagePath);
  const extracted = await extractDocument(buffer, ext);
  const chunks = await chunkExtractedText(doc.source_file, extracted.pages);

  const rows = chunks.map((c) => ({
    document_id: documentId,
    heading: c.heading,
    text: c.text,
    citation: `${doc.source_file} — Page/Section ${c.pageOrSection}`,
  }));
  const { error } = await admin.from("corpus_chunks").insert(rows);
  if (error) throw error;

  return { chunkCount: rows.length };
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

  await extractAndSaveChunks(documentId, storagePath);

  // Suspends here — costs nothing while waiting — until the teacher
  // approves or rejects via POST /api/ingest/review.
  const hook = createHook<{ approved: boolean; reviewerId: string }>({ token: `review:${documentId}` });
  const { approved, reviewerId } = await hook;

  await finalizeDocument(documentId, approved, reviewerId);

  return { documentId, approved };
}
