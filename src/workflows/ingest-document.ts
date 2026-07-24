import { FatalError } from "workflow";
import { extractAndSaveChunks, DocumentNotFoundError, UnsupportedFileError } from "@/lib/ingestion/process";

// One durable step: download, extract, chunk, save.
//
// Formats that need a model call (DOCX/PDF/TXT) can take tens of seconds, so
// they run here rather than blocking a request. PPTX no longer reaches this
// workflow at all — see POST /api/ingest/upload-complete.
async function processDocument(documentId: string, storagePath: string) {
  "use step";
  try {
    return await extractAndSaveChunks(documentId, storagePath);
  } catch (err) {
    // Bad input can never succeed on retry — fail fast instead of burning
    // the engine's retry budget.
    if (err instanceof DocumentNotFoundError || err instanceof UnsupportedFileError) {
      throw new FatalError(err.message);
    }
    throw err;
  }
}

// The workflow now ENDS once chunks are saved. It used to suspend here on a
// createHook() waiting for the teacher's approve/reject, which meant every
// review had to travel back through the workflow engine to resume it.
// Approval is just a database state change, so POST /api/ingest/review
// applies it directly — no suspension, no engine round trip, and it works
// identically for PPTX (which never starts a workflow) and everything else.
export async function ingestDocumentWorkflow(documentId: string, storagePath: string) {
  "use workflow";

  const chunkCount = await processDocument(documentId, storagePath);
  return { documentId, chunkCount };
}
