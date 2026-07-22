"use client";

import { useState } from "react";
import type { TeacherDocument } from "@/lib/ingestion/documents";
import { currentAcademicYear } from "@/lib/ingestion/academic-year";
import { CORPUS_BUCKET } from "@/lib/ingestion/bucket";
import { supabaseBrowser } from "@/lib/supabase/client";
import ChunkQuestions from "./ChunkQuestions";

type Doc = TeacherDocument;

// A response can be JSON (our own API routes) or plain text (a platform-
// level rejection that never reached our code) — never assume .json() will
// succeed. Reads the body once as text, since a failed .json() call already
// consumes the body and a second .text() call would throw.
async function safeJson(res: Response): Promise<{ error?: string; [key: string]: unknown }> {
  const text = await res.text().catch(() => "");
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || `Request failed (${res.status}).` };
  }
}

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
      const data = await safeJson(res);
      setDocuments((data.documents as Doc[] | undefined) ?? []);
    } finally {
      setLoading(false);
    }
  }

  // Two-step, direct-to-storage upload: file bytes never pass through our
  // own server (Vercel functions cap request bodies at ~4.5 MB, far below a
  // real slide deck). Step 1 (upload-init) authorizes the upload and hands
  // back a signed URL per file; step 2 is the browser uploading straight to
  // Supabase Storage; step 3 (upload-complete) tells the server a given
  // file's bytes actually landed, which is what starts the (real-cost)
  // extraction workflow — a file whose direct upload never finishes never
  // triggers processing.
  async function upload(form: FormData) {
    setError(null);
    setUploading(true);
    try {
      const fileList = form.getAll("file").filter((f): f is File => f instanceof File);
      if (fileList.length === 0) throw new Error("Choose at least one file.");

      const initRes = await fetch("/api/ingest/upload-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: form.get("subject"),
          grade: form.get("grade"),
          academicYear: form.get("academicYear"),
          sections: form.get("sections"),
          files: fileList.map((f) => ({ name: f.name, size: f.size })),
        }),
      });
      const initData = await safeJson(initRes);
      if (!initRes.ok) throw new Error((initData.error as string | undefined) || "Upload failed.");

      const targets = (initData.files as { name: string; documentId: string; path: string; token: string }[]) ?? [];
      const supabase = supabaseBrowser();
      const failures: string[] = [];

      // Zipped by index, not name — upload-init created one document per
      // file in the same order it received them, and names aren't
      // guaranteed unique if a teacher picks the same file twice.
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const file = fileList[i];
        if (!file) continue;

        const { error: uploadErr } = await supabase.storage.from(CORPUS_BUCKET).uploadToSignedUrl(
          target.path,
          target.token,
          file,
        );
        if (uploadErr) {
          failures.push(`"${target.name}": ${uploadErr.message}`);
          continue;
        }

        const completeRes = await fetch("/api/ingest/upload-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: target.documentId, storagePath: target.path }),
        });
        if (!completeRes.ok) {
          const completeData = await safeJson(completeRes);
          failures.push(`"${target.name}": ${(completeData.error as string | undefined) || "failed to start processing"}`);
        }
      }

      if (failures.length > 0) {
        const okCount = targets.length - failures.length;
        setError(`${okCount}/${targets.length} file(s) uploaded. Failed — ${failures.join("; ")}`);
      }
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
          <label className="mb-1 block text-xs text-[var(--muted)]">Files (.docx, .pdf, .pptx, .txt)</label>
          <input
            type="file"
            name="file"
            accept=".docx,.pdf,.pptx,.txt"
            multiple
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
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Academic year</label>
          <input
            type="text"
            name="academicYear"
            defaultValue={currentAcademicYear()}
            className="w-28 rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-[var(--border)]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--muted)]">Section(s)</label>
          <input
            type="text"
            name="sections"
            required
            placeholder="7A or 7A, 7B"
            className="w-32 rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-[var(--border)]"
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
      <p className="text-xs text-[var(--muted)]">
        Pick one or more files at once. Enter one section, or several of your own sections (comma-separated) to apply
        this material to all of them.
      </p>
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
