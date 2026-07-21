"use client";

import { useState } from "react";
import type { TeacherDocument } from "@/lib/ingestion/documents";
import ChunkQuestions from "./ChunkQuestions";

type Doc = TeacherDocument;

// Initial data comes from the server-rendered page (see
// app/teacher/ingest/page.tsx) rather than a mount-time client fetch —
// avoids a redundant round-trip and a setState-in-effect anti-pattern. The
// "Refresh" button and post-action refreshes are plain event-handler calls,
// not effects, so they're unaffected by that same concern.
export default function IngestPanel({ initialDocuments }: { initialDocuments: Doc[] }) {
  const [documents, setDocuments] = useState<Doc[]>(initialDocuments);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/ingest/documents");
      const data = await res.json();
      setDocuments(data.documents ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function upload(form: FormData) {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch("/api/ingest/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function review(documentId: string, approved: boolean) {
    await fetch("/api/ingest/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, approved }),
    });
    await refresh();
  }

  return (
    <div className="space-y-6">
      <form
        action={upload}
        className="glass flex flex-wrap items-end gap-3 rounded-3xl p-5"
      >
        <div className="flex-1">
          <label className="mb-1 block text-xs text-[var(--muted)]">File (.docx or .pdf)</label>
          <input
            type="file"
            name="file"
            accept=".docx,.pdf"
            required
            className="w-full rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-[var(--border)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Subject</label>
          <input
            type="text"
            name="subject"
            defaultValue="Physics"
            className="w-32 rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-[var(--border)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Grade</label>
          <input
            type="text"
            name="grade"
            defaultValue="Grade 7"
            className="w-28 rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-[var(--border)]"
          />
        </div>
        <button
          type="submit"
          disabled={uploading}
          className="rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>
      {error && <p className="text-sm text-[var(--warn)]">{error}</p>}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">Your uploads</h2>
        <button onClick={refresh} disabled={loading} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {documents.length === 0 && <p className="text-sm text-[var(--muted)]">No uploads yet.</p>}

      {documents.map((doc) => (
        <div key={doc.id} className="glass rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div className="font-medium">{doc.source_file}</div>
            <StatusBadge status={doc.status} hasChunks={doc.chunks.length > 0} />
          </div>

          {doc.status === "pending" && doc.chunks.length === 0 && (
            <p className="mt-2 text-xs text-[var(--muted)]">Extracting and chunking — refresh in a moment.</p>
          )}

          {doc.chunks.length > 0 && (
            <div className="mt-3 space-y-2">
              {doc.chunks.map((c) => (
                <div key={c.id} className="rounded-2xl bg-black/20 p-3 text-sm">
                  {c.heading && <div className="mb-1 font-semibold text-[var(--brand2)]">{c.heading}</div>}
                  <p className="text-[var(--text)]/85">{c.text}</p>
                  <div className="mt-1 text-xs text-[var(--muted)]">📖 {c.citation}</div>
                  {doc.status === "approved" && <ChunkQuestions chunk={c} onChanged={refresh} />}
                </div>
              ))}
            </div>
          )}

          {doc.status === "pending" && doc.chunks.length > 0 && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => review(doc.id, true)}
                className="rounded-lg bg-[var(--good)] px-3 py-1.5 text-xs font-medium text-black"
              >
                ✓ Approve
              </button>
              <button
                onClick={() => review(doc.id, false)}
                className="rounded-lg bg-[var(--bad)] px-3 py-1.5 text-xs font-medium text-white"
              >
                ✗ Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status, hasChunks }: { status: Doc["status"]; hasChunks: boolean }) {
  if (status === "approved") {
    return <span className="rounded-full bg-[rgba(52,211,153,0.16)] px-2 py-0.5 text-xs text-[var(--good)]">Approved</span>;
  }
  if (status === "rejected") {
    return <span className="rounded-full bg-[rgba(248,113,113,0.16)] px-2 py-0.5 text-xs text-[var(--bad)]">Rejected</span>;
  }
  return (
    <span className="rounded-full bg-[rgba(251,191,36,0.16)] px-2 py-0.5 text-xs text-[var(--warn)]">
      {hasChunks ? "Ready for review" : "Processing…"}
    </span>
  );
}
