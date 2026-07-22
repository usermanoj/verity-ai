import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
    .select("uploaded_by, status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.uploaded_by !== user.id) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  if (doc.status !== "pending") {
    return NextResponse.json({ error: "Document already processed." }, { status: 409 });
  }

  await start(ingestDocumentWorkflow, [documentId, storagePath]);

  return NextResponse.json({ documentId, status: "processing" });
}
