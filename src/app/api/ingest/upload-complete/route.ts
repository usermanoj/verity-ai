import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { needsModelChunking } from "@/lib/ingestion/chunk";
import { extractAndSaveChunks } from "@/lib/ingestion/process";
import { ingestDocumentWorkflow } from "@/workflows/ingest-document";

export const runtime = "nodejs";

// Step 2 of 2: called by the client once its direct-to-storage upload for
// this document actually succeeded (see upload-init.ts + IngestPanel.tsx).
// Only then does the (real-cost) extraction/chunking workflow start — a
// document whose browser upload never completes (tab closed, network drop)
// just sits as an inert 'pending' row with no chunks, which is an accepted
// harmless edge case rather than something worth building cleanup for yet.
export async function POST(req: NextRequest) {
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Ingestion isn't configured for this deployment yet." }, { status: 503 });
  }

  const user = await getCurrentAppUser();
  if (!user || user.role !== "teacher") {
    return NextResponse.json({ error: "Only signed-in teachers can complete uploads." }, { status: 403 });
  }

  const { documentId, storagePath } = (await req.json().catch(() => ({}))) as {
    documentId?: string;
    storagePath?: string;
  };
  if (!documentId || !storagePath) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Confirm this document belongs to the calling teacher before starting
  // any processing on it — documentId is client-supplied.
  const { data: doc } = await supabaseAdmin()
    .from("corpus_documents")
    .select("uploaded_by, status, source_file")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.uploaded_by !== user.id) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  if (doc.status !== "pending") {
    return NextResponse.json({ error: "Document already processed." }, { status: 409 });
  }

  const ext = doc.source_file.split(".").pop()?.toLowerCase() ?? "";

  // Formats that need no model call are processed INLINE, right here.
  //
  // They were previously handed to the durable workflow like everything
  // else, and that dispatch was measured at 8–11 seconds for a slide deck
  // whose real work (download, unzip, insert) takes under a second — the
  // engine, not the work, was the wait. Durability buys nothing for an
  // operation this short, so the request just does it and returns "ready".
  if (!needsModelChunking(ext)) {
    try {
      const chunkCount = await extractAndSaveChunks(documentId, storagePath);
      return NextResponse.json({ documentId, status: "ready", chunkCount });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to process document." },
        { status: 500 },
      );
    }
  }

  // Model-chunked formats (DOCX/PDF/TXT) can take tens of seconds, which is
  // far too long to hold a request open — those stay on the workflow.
  await start(ingestDocumentWorkflow, [documentId, storagePath]);

  return NextResponse.json({ documentId, status: "processing" });
}
