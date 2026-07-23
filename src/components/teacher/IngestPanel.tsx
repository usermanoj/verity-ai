"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { TeacherDocument } from "@/lib/ingestion/documents";
import { currentAcademicYear } from "@/lib/ingestion/academic-year";
import { CORPUS_BUCKET } from "@/lib/ingestion/bucket";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PRESSABLE } from "@/lib/ui";
import ChunkQuestions from "./ChunkQuestions";

type Doc = TeacherDocument;

// A document is still being extracted/chunked in the background (workflow
// running) while it's pending with no chunks yet. Used both for the badge
// and to decide whether to keep auto-polling.
function isProcessing(doc: Doc): boolean {
  return doc.status === "pending" && doc.chunks.length === 0;
}

// Sort so the things that need the teacher's attention float to the top and
// finished (approved/rejected) material sinks below — instead of a flat
// newest-first pile where one approved deck's chunks bury everything.
function statusRank(doc: Doc): number {
  if (doc.status === "pending" && doc.chunks.length > 0) return 0; // ready for review — needs a click
  if (isProcessing(doc)) return 1; // in progress — just uploaded
  if (doc.status === "approved") return 2;
  return 3; // rejected
}

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
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which finished (approved/rejected) documents the teacher has manually
  // expanded. Actionable ones (processing / ready-for-review) are always
  // shown open; finished ones stay collapsed unless opened, so approving a
  // deck tidies it away instead of leaving its chunks on screen.
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  // Filenames shown as instant placeholder cards the moment Upload is
  // clicked, before any network call returns. Without this there's a dead
  // zone where nothing visibly happens, which is what makes people click
  // Upload a second time.
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  // Friendly, non-error guidance (upload confirmed, be patient, etc.) —
  // kept separate from `error` so success and failure never share styling.
  const [notice, setNotice] = useState<string | null>(null);
  // Which document is mid approve/reject, so that card's own buttons can show
  // the pending state rather than sitting inert until the server replies.
  const [reviewing, setReviewing] = useState<{ id: string; approved: boolean } | null>(null);
  // Re-entry guard read synchronously; `uploading` state can be stale inside
  // an in-flight handler's closure.
  const busyRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // no-store: a plain GET can be served from the browser/HTTP cache,
      // which made "Refresh" look like it did nothing — force a fresh read.
      const res = await fetch("/api/ingest/documents", { cache: "no-store" });
      const data = await safeJson(res);
      setDocuments((data.documents as Doc[] | undefined) ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  function isOpen(doc: Doc): boolean {
    // Processing and ready-for-review are always open (they need attention);
    // approved/rejected are collapsed until the teacher clicks to expand.
    if (doc.status === "pending") return true;
    return openIds.has(doc.id);
  }
  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sortedDocs = [...documents].sort((a, b) => {
    const r = statusRank(a) - statusRank(b);
    return r !== 0 ? r : (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });

  // Auto-poll while any document is still processing, so the list updates
  // itself the moment extraction/chunking finishes — no manual refresh. The
  // interval clears itself once nothing is processing (the effect re-runs on
  // every documents change and simply doesn't re-arm), so it never polls
  // idly. setState happens only inside the async interval callback (via
  // refresh), never synchronously in the effect body.
  const anyProcessing = documents.some(isProcessing);
  useEffect(() => {
    if (!anyProcessing) return;
    const timer = setInterval(() => {
      void refresh();
    }, 3500);
    return () => clearInterval(timer);
  }, [anyProcessing, refresh]);

  // Two-step, direct-to-storage upload: file bytes never pass through our
  // own server (Vercel functions cap request bodies at ~4.5 MB, far below a
  // real slide deck). Step 1 (upload-init) authorizes the upload and hands
  // back a signed URL per file; step 2 is the browser uploading straight to
  // Supabase Storage; step 3 (upload-complete) tells the server a given
  // file's bytes actually landed, which is what starts the (real-cost)
  // extraction workflow — a file whose direct upload never finishes never
  // triggers processing.
  async function upload(form: FormData) {
    const fileList = form.getAll("file").filter((f): f is File => f instanceof File);

    // Clicking Upload again mid-flight gets a real explanation rather than a
    // dead, unresponsive button.
    if (busyRef.current) {
      setNotice("Still uploading your last batch — hang tight, it'll appear below automatically.");
      return;
    }
    if (fileList.length === 0) {
      setNotice(
        documents.some(isProcessing)
          ? "Your last upload is still being processed — it'll appear below automatically when it's ready. Pick more files to add another."
          : "Choose at least one file to upload.",
      );
      return;
    }

    busyRef.current = true;
    setError(null);
    setUploading(true);
    setUploadProgress(null);
    // Both of these render before the first await, so clicking Upload gives
    // an instant, visible acknowledgement — the placeholder cards *and* a
    // message. Waiting for the round-trip to say anything is what left people
    // guessing (and clicking Upload again).
    setPendingNames(fileList.map((f) => f.name));
    setNotice(
      `Uploading ${fileList.length} file${fileList.length > 1 ? "s" : ""}… please keep this tab open.`,
    );
    try {
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

      // Upload every file in parallel (zipped by index — upload-init created
      // one document per file in the order received, and names aren't unique
      // if the same file is picked twice). A slow deck no longer blocks the
      // others, so a 3-file upload takes about as long as its largest file.
      let done = 0;
      const results = await Promise.all(
        targets.map(async (target, i): Promise<string | null> => {
          const file = fileList[i];
          if (!file) return `"${target.name}": file missing`;

          const { error: uploadErr } = await supabase.storage
            .from(CORPUS_BUCKET)
            .uploadToSignedUrl(target.path, target.token, file);
          if (uploadErr) {
            setUploadProgress(`${(done += 1)}/${targets.length}`);
            return `"${target.name}": ${uploadErr.message}`;
          }

          const completeRes = await fetch("/api/ingest/upload-complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documentId: target.documentId, storagePath: target.path }),
          });
          setUploadProgress(`${(done += 1)}/${targets.length}`);
          if (!completeRes.ok) {
            const completeData = await safeJson(completeRes);
            return `"${target.name}": ${(completeData.error as string | undefined) || "failed to start processing"}`;
          }
          return null;
        }),
      );

      const failures = results.filter((r): r is string => r !== null);
      const okCount = targets.length - failures.length;
      if (failures.length > 0) {
        setError(`${okCount}/${targets.length} file(s) uploaded. Failed — ${failures.join("; ")}`);
      }
      if (okCount > 0) {
        setNotice(
          `✓ ${okCount} file${okCount > 1 ? "s" : ""} uploaded — now extracting the content. ` +
            `This list updates itself, so there's no need to refresh or upload again.`,
        );
      }

      // Clear the picked files so a second click can't silently re-upload
      // the same deck (which is how the duplicate cards happened). Section/
      // subject/grade are intentionally left as-is for the next upload.
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      busyRef.current = false;
      setUploading(false);
      setUploadProgress(null);
      setPendingNames([]);
    }
  }

  async function review(documentId: string, approved: boolean) {
    // Acknowledge on the control the teacher actually clicked — the top-of-
    // page notice alone isn't enough, since a document lower down the list
    // can be well below the fold when its Approve button is pressed.
    if (reviewing) return;
    setReviewing({ id: documentId, approved });
    setError(null);
    setNotice(approved ? "Approving — saving your decision…" : "Rejecting — saving your decision…");
    try {
      const res = await fetch("/api/ingest/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, approved }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        setError((data.error as string | undefined) || "Couldn't save your decision — please try again.");
        setNotice(null);
        return;
      }
      setNotice(
        approved
          ? "✓ Approved — this material is now part of your class corpus. You can generate practice questions from it below."
          : "✗ Rejected — this material won't be used, and its extracted chunks have been discarded.",
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your decision — please try again.");
      setNotice(null);
    } finally {
      setReviewing(null);
    }
  }

  return (
    <div className="space-y-6">
      <form
        action={upload}
        className="glass flex flex-wrap items-end gap-3 rounded-3xl p-5"
      >
        <div className="flex-1">
          <label className="mb-1 block text-xs text-[var(--muted)]">Files (.docx, .pdf, .pptx, .txt)</label>
          {/* Deliberately not `required` — validation is handled in upload()
              so an empty submit can explain *why* (e.g. "your last upload is
              still processing") instead of a generic browser tooltip. */}
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            accept=".docx,.pdf,.pptx,.txt"
            multiple
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
        {/* aria-disabled (not `disabled`) so a second click still reaches the
            handler and gets a "still uploading" explanation — a truly
            disabled button would silently swallow it, which is what made the
            UI feel unresponsive. */}
        <button
          type="submit"
          aria-disabled={uploading}
          className={`rounded-xl bg-[var(--brand)] px-5 py-2 text-sm font-medium text-white ${PRESSABLE} ${
            uploading ? "cursor-not-allowed opacity-60" : "hover:-translate-y-0.5"
          }`}
        >
          {uploading ? (uploadProgress ? `Uploading ${uploadProgress}…` : "Uploading…") : "Upload"}
        </button>
      </form>
      <p className="text-xs text-[var(--muted)]">
        Pick one or more files at once. Enter one section, or several of your own sections (comma-separated) to apply
        this material to all of them.
      </p>
      {notice && (
        <p className="rounded-2xl bg-[rgba(99,102,241,0.12)] px-4 py-3 text-sm text-[var(--brand2)]">{notice}</p>
      )}
      {error && <p className="text-sm text-[var(--warn)]">{error}</p>}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">Your uploads</h2>
        {anyProcessing ? (
          <span className="text-xs text-[var(--warn)]">● Auto-updating while processing…</span>
        ) : (
          <button
            onClick={refresh}
            disabled={loading}
            className={`rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-60 ${PRESSABLE}`}
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        )}
      </div>

      {/* Instant optimistic cards — visible the moment Upload is clicked,
          replaced by the real documents as soon as the server confirms. */}
      {pendingNames.map((name, i) => (
        <div key={`pending-${i}`} className="glass rounded-3xl p-5 opacity-70">
          <div className="flex items-center justify-between">
            <div className="font-medium">{name}</div>
            <span className="rounded-full bg-[rgba(99,102,241,0.16)] px-2 py-0.5 text-xs text-[var(--brand2)]">
              Uploading…
            </span>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">Sending securely — please keep this tab open.</p>
        </div>
      ))}

      {documents.length === 0 && pendingNames.length === 0 && (
        <p className="text-sm text-[var(--muted)]">No uploads yet.</p>
      )}

      {sortedDocs.map((doc) => {
        const collapsible = doc.status === "approved" || doc.status === "rejected";
        const open = isOpen(doc);
        return (
          <div key={doc.id} className="glass rounded-3xl p-5">
            <div
              className={`flex items-center justify-between ${collapsible ? "cursor-pointer select-none" : ""}`}
              onClick={collapsible ? () => toggleOpen(doc.id) : undefined}
            >
              <div className="flex items-center gap-2 font-medium">
                {collapsible && <span className="text-xs text-[var(--muted)]">{open ? "▾" : "▸"}</span>}
                <span>{doc.source_file}</span>
                {collapsible && doc.chunks.length > 0 && (
                  <span className="text-xs font-normal text-[var(--muted)]">· {doc.chunks.length} chunks</span>
                )}
              </div>
              <StatusBadge status={doc.status} hasChunks={doc.chunks.length > 0} />
            </div>

            {isProcessing(doc) && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                ✓ Uploaded — now extracting &amp; chunking in the background. This updates automatically.
              </p>
            )}

            {open && doc.chunks.length > 0 && (
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
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => review(doc.id, true)}
                  aria-disabled={reviewing !== null}
                  className={`rounded-lg bg-[var(--good)] px-3 py-1.5 text-xs font-medium text-black ${PRESSABLE} ${
                    reviewing !== null ? "cursor-not-allowed opacity-60" : ""
                  }`}
                >
                  {reviewing?.id === doc.id && reviewing.approved ? "Approving…" : "✓ Approve"}
                </button>
                <button
                  onClick={() => review(doc.id, false)}
                  aria-disabled={reviewing !== null}
                  className={`rounded-lg bg-[var(--bad)] px-3 py-1.5 text-xs font-medium text-white ${PRESSABLE} ${
                    reviewing !== null ? "cursor-not-allowed opacity-60" : ""
                  }`}
                >
                  {reviewing?.id === doc.id && !reviewing.approved ? "Rejecting…" : "✗ Reject"}
                </button>
                {reviewing?.id === doc.id && (
                  <span className="text-xs text-[var(--muted)]">Saving your decision…</span>
                )}
              </div>
            )}
          </div>
        );
      })}
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
