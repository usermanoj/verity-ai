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
    media?: { pageOrSection: number; storagePath: string; width: number; height: number; kind?: string }[];
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
        // Anything unrecognised records as a figure, which renders inline —
        // the safe default, since a mislabelled slide would hide content.
        kind: m.kind === "slide" ? ("slide" as const) : ("figure" as const),
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
      // Remove the row rather than leaving it behind.
      //
      // A document that fails chunking is pending with zero chunks, which the
      // teacher's list renders as "Processing…" — indistinguishable from work
      // still running, and it never resolves. Failed uploads accumulated as
      // phantoms that could not be approved, rejected or retried, and they
      // also held their filename against the duplicate check.
      //
      // Deleting is safe: no chunks exist yet, and the teacher's next attempt
      // is a clean upload of the same file.
      await supabaseAdmin().from("corpus_documents").delete().eq("id", documentId);

      // The friendly sentence is what the teacher reads; the provider's own
      // words still have to reach somebody. Rewriting the message without
      // keeping the original made the next failure undiagnosable — the reply
      // said "couldn't read this file" for a cause that had nothing to do
      // with the file. Logged for the server, and returned as `detail` for
      // the diagnostics line the ingest page already shows.
      console.error("ingest failed", { documentId, error: err });

      return NextResponse.json(
        { error: explainIngestFailure(err), detail: technicalDetail(err) },
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

// Turns a provider error into something a teacher can act on.
//
// The raw text is written for whoever integrated the API, not for the person
// holding the deck: "This model does not support response format
// `json_schema`. See supported models at console.groq.com/..." told a physics
// teacher nothing except that the software was broken.
function explainIngestFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? "");

  if (/rate[- ]?limit|too many requests|quota/i.test(message)) {
    return "The AI service is busy right now. Nothing was saved — please try this upload again in a minute.";
  }
  if (/json_schema|response format|structured output/i.test(message)) {
    return "The AI service returned an unusable response. Nothing was saved — please try again.";
  }
  return "Couldn't read this file. Nothing was saved — please check it opens normally and try again.";
}

// A compact, safe version of the underlying error for the diagnostics line.
//
// Truncated because provider errors can carry long payload echoes, and
// bounded so nothing unexpected ends up rendered at length in a teacher's
// browser.
function technicalDetail(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return message.replace(/\s+/g, " ").trim().slice(0, 300);
}
