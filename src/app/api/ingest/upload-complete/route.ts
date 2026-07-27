import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/admin";
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

  const { documentId, storagePath, pages, media, tables } = (await req.json().catch(() => ({}))) as {
    documentId?: string;
    storagePath?: string;
    pages?: { pageOrSection: number; text: string }[];
    media?: { pageOrSection: number; storagePath: string; width: number; height: number }[];
    tables?: { pageOrSection: number; headers: string[]; rows: string[][] }[];
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

  // The browser extracts PPTX text itself (it already has the file), so the
  // server needn't pull the original back out of Storage. Shape-validated and
  // bounded here, since it's client-supplied.
  const supplied = Array.isArray(pages)
    ? pages
        .filter(
          (p) => p && typeof p.pageOrSection === "number" && typeof p.text === "string" && p.text.length < 200_000,
        )
        .slice(0, 2000)
    : undefined;

  // Diagrams the browser pulled out of the same .pptx, already uploaded to
  // Storage under this document's prefix. Recorded before chunking so they're
  // present the moment the teacher reviews.
  //
  // Every row is pinned to this document's prefix regardless of what the
  // client sent: the paths are otherwise client-supplied, and a row pointing
  // at another document's storage would leak one class's material into
  // another's lesson.
  if (Array.isArray(media) && media.length > 0) {
    const rows = media
      .filter(
        (m) =>
          m &&
          typeof m.pageOrSection === "number" &&
          typeof m.storagePath === "string" &&
          m.storagePath.startsWith(`${documentId}/media/`),
      )
      .slice(0, 40)
      .map((m) => ({
        document_id: documentId,
        page_or_section: m.pageOrSection,
        storage_path: m.storagePath,
        width: typeof m.width === "number" ? m.width : null,
        height: typeof m.height === "number" ? m.height : null,
      }));
    // A failure here costs the lesson its pictures, not its text.
    if (rows.length > 0) await supabaseAdmin().from("corpus_document_media").insert(rows);
  }

  // Data tables lifted from the same deck. Bounded on every axis because the
  // shape is client-supplied: a crafted request should cost one rejected row,
  // not a lesson page rendering a thousand-column grid.
  if (Array.isArray(tables) && tables.length > 0) {
    const rows = tables
      .filter(
        (t) =>
          t &&
          typeof t.pageOrSection === "number" &&
          Array.isArray(t.headers) &&
          Array.isArray(t.rows) &&
          t.headers.length >= 2 &&
          t.headers.length <= 8 &&
          t.rows.length <= 60,
      )
      .slice(0, 20)
      .map((t) => ({
        document_id: documentId,
        page_or_section: t.pageOrSection,
        headers: t.headers.slice(0, 8).map((h) => String(h).slice(0, 120)),
        rows: t.rows.slice(0, 60).map((r) => r.slice(0, 8).map((c) => String(c).slice(0, 120))),
      }));
    if (rows.length > 0) await supabaseAdmin().from("corpus_document_tables").insert(rows);
  }

  // Route on whether the text is ALREADY extracted, not on file format.
  //
  // Format was the wrong signal: it decided "needs a model call → send it to
  // the durable workflow", but workflow dispatch measured 8–11s while the
  // model call itself — fast tier, parallel batches, ~50 kB of text — takes a
  // few seconds. The engine cost more than the work it was deferring.
  //
  // What actually justifies deferring is an unbounded server-side job:
  // downloading a large PDF/DOCX and extracting it before the model even
  // starts. When the client has already done the extraction, the remaining
  // work is short and bounded, so the request just does it and returns
  // "ready" — no dispatch, no polling wait.
  if (supplied && supplied.length > 0) {
    try {
      const chunkCount = await extractAndSaveChunks(documentId, storagePath, supplied);
      return NextResponse.json({ documentId, status: "ready", chunkCount });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to process document." },
        { status: 500 },
      );
    }
  }

  // Server-side extraction (a large PDF or DOCX downloaded from Storage,
  // then chunked) is unbounded enough to be worth deferring — those stay on
  // the durable workflow.
  await start(ingestDocumentWorkflow, [documentId, storagePath]);

  return NextResponse.json({ documentId, status: "processing" });
}
