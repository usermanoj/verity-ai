"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { TeacherDocument } from "@/lib/ingestion/documents";
import { currentAcademicYear } from "@/lib/ingestion/academic-year";
import { PRESSABLE } from "@/lib/ui";
import ChunkQuestions from "./ChunkQuestions";

// Uploads a file straight to the signed Storage URL with a plain fetch.
//
// This deliberately does NOT use @supabase/supabase-js: importing it here
// pulled a 244 kB client chunk (GoTrue auth + the Realtime WebSocket client,
// neither of which this page uses) into /teacher/ingest, which the browser
// had to download and parse before the panel could hydrate — the reason this
// route felt slow next to pages that import none of it.
//
// The wire format mirrors storage-js's own uploadToSignedUrl exactly: PUT to
// the signed URL, multipart body with `cacheControl` and the file under the
// empty-string key (see node_modules/@supabase/storage-js/src/packages/
// StorageFileApi.ts).
async function putToSignedUrl(signedUrl: string, file: File): Promise<string | null> {
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  try {
    const res = await fetch(signedUrl, { method: "PUT", body });
    if (res.ok) return null;
    const text = await res.text().catch(() => "");
    return text || `upload failed (${res.status})`;
  } catch (err) {
    return err instanceof Error ? err.message : "upload failed";
  }
}

type Doc = TeacherDocument;

// A document is still being extracted/chunked in the background (workflow
// running) while it's pending with no chunks yet. Used both for the badge
// and to decide whether to keep auto-polling.
function isProcessing(doc: Doc): boolean {
  // chunkCount, not chunks.length — collapsed documents intentionally ship
  // without their text, so chunks.length would wrongly read as "processing".
  return doc.status === "pending" && doc.chunkCount === 0;
}

// Sort so the things that need the teacher's attention float to the top and
// finished (approved/rejected) material sinks below — instead of a flat
// newest-first pile where one approved deck's chunks bury everything.
function statusRank(doc: Doc): number {
  if (doc.status === "pending" && doc.chunkCount > 0) return 0; // ready for review — needs a click
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

// The document list is fetched here rather than server-rendered into the
// page. It used to arrive as a prop, which meant the whole route — upload
// form included — waited on an auth lookup plus three queries pulling every
// chunk's full text before any HTML was sent. The form needs none of that,
// so loading it here lets the page paint immediately and the list fill in.
export default function IngestPanel() {
  const [documents, setDocuments] = useState<Doc[]>([]);
  // Distinguishes "still loading the first time" from "genuinely no uploads",
  // so the empty state never flashes before the data arrives.
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which finished (approved/rejected) documents the teacher has manually
  // expanded. Actionable ones (processing / ready-for-review) are always
  // shown open; finished ones stay collapsed unless opened, so approving a
  // deck tidies it away instead of leaving its chunks on screen.
  // Documents whose open/closed state the teacher has flipped away from the
  // default. The default is: only the one deck currently up for review is
  // open — everything else is collapsed, so the page never renders hundreds
  // of chunk cards at once.
  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set());
  // Which document is currently fetching its chunk text after being expanded.
  const [chunksLoadingId, setChunksLoadingId] = useState<string | null>(null);
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
      if (!res.ok) {
        setError((data.error as string | undefined) || "Couldn't load your uploads.");
        return;
      }
      const next = (data.documents as Doc[] | undefined) ?? [];
      // Carry over chunk text already fetched for expanded documents — the
      // list response omits it for collapsed ones, so a plain overwrite would
      // blank out a deck the teacher currently has open.
      setDocuments((prev) => {
        const loaded = new Map(prev.filter((d) => d.chunks.length > 0).map((d) => [d.id, d.chunks]));
        return next.map((d) =>
          d.chunks.length === 0 && loaded.has(d.id) ? { ...d, chunks: loaded.get(d.id)! } : d,
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your uploads.");
    } finally {
      setLoadedOnce(true);
      setLoading(false);
    }
  }, []);

  // Initial load. Written inline rather than calling refresh() because
  // refresh() flips its loading flag *synchronously* — a setState in the
  // effect body, which react-hooks/set-state-in-effect (correctly) rejects.
  // Here every state update happens after an await, and a cancelled flag
  // stops a late response from writing into an unmounted component.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/ingest/documents", { cache: "no-store" });
        const data = await safeJson(res);
        if (cancelled) return;
        if (!res.ok) setError((data.error as string | undefined) || "Couldn't load your uploads.");
        else setDocuments((data.documents as Doc[] | undefined) ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load your uploads.");
      } finally {
        if (!cancelled) setLoadedOnce(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function isOpen(doc: Doc): boolean {
    // Open by default only for the single deck currently up for review;
    // toggledIds flips that default in either direction.
    const openByDefault = doc.id === firstReadyForReviewId;
    return toggledIds.has(doc.id) ? !openByDefault : openByDefault;
  }
  async function toggleOpen(id: string) {
    const doc = documents.find((d) => d.id === id);
    if (!doc) return;
    const opening = !isOpen(doc);
    setToggledIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (!opening) return;

    // Collapsed documents ship without their chunk text (that's what keeps
    // the list fast) — fetch it the first time one is expanded.
    if (doc.chunkCount === 0 || doc.chunks.length > 0) return;

    setChunksLoadingId(id);
    try {
      const res = await fetch(`/api/ingest/chunks?documentId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await safeJson(res);
      if (!res.ok) {
        setError((data.error as string | undefined) || "Couldn't load this document's content.");
        return;
      }
      const chunks = (data.chunks as Doc["chunks"] | undefined) ?? [];
      setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, chunks } : d)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load this document's content.");
    } finally {
      setChunksLoadingId(null);
    }
  }

  const sortedDocs = [...documents].sort((a, b) => {
    const r = statusRank(a) - statusRank(b);
    return r !== 0 ? r : (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });

  // The one deck the teacher is being asked to review right now. It's the
  // only one expanded by default, and the only one whose chunk text the
  // list endpoint ships — the two must agree, so both pick the most recent
  // ready-for-review document.
  const firstReadyForReviewId =
    sortedDocs.find((d) => d.status === "pending" && d.chunkCount > 0)?.id ?? null;

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
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Fire-and-forget: the synchronous part of upload() (which sets the
    // pending message and placeholder cards) runs inside this event handler,
    // so React flushes it before the next paint.
    void upload(new FormData(e.currentTarget));
  }

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

      const targets =
        (initData.files as { name: string; documentId: string; path: string; signedUrl: string }[]) ?? [];

      // Upload every file in parallel (zipped by index — upload-init created
      // one document per file in the order received, and names aren't unique
      // if the same file is picked twice). A slow deck no longer blocks the
      // others, so a 3-file upload takes about as long as its largest file.
      let done = 0;
      const results = await Promise.all(
        targets.map(async (target, i): Promise<string | null> => {
          const file = fileList[i];
          if (!file) return `"${target.name}": file missing`;

          const uploadErr = await putToSignedUrl(target.signedUrl, file);
          if (uploadErr) {
            setUploadProgress(`${(done += 1)}/${targets.length}`);
            return `"${target.name}": ${uploadErr}`;
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
      {/* Plain onSubmit, NOT React 19's `action={fn}`: a form action is
          implicitly wrapped in a transition, which *defers* the state updates
          inside it — so "show the message before the first await" silently
          never rendered until the whole upload finished. That deferral is why
          pending UI for form actions needs useActionState/useFormStatus (see
          next/dist/docs/01-app/02-guides/forms.md). A normal submit handler
          keeps our updates urgent, so feedback paints on the next frame. */}
      <form
        onSubmit={handleSubmit}
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
      {/* Status lives in a fixed toast, not an inline banner: an inline
          message sits wherever the page happens to be scrolled, so the
          confirmation for a button pressed further down the list can appear
          entirely off-screen. Errors stay inline below (persistent, needs
          reading); transient status goes here (impossible to miss). */}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-6 z-50 flex max-w-[92vw] -translate-x-1/2 items-start gap-3 rounded-2xl bg-[var(--brand)] px-4 py-3 text-sm text-white shadow-2xl ring-1 ring-white/15"
        >
          <span>{notice}</span>
          <button
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
            className={`-mr-1 shrink-0 rounded-md px-1.5 text-white/70 hover:text-white ${PRESSABLE}`}
          >
            ×
          </button>
        </div>
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

      {!loadedOnce && pendingNames.length === 0 && (
        <div className="space-y-4">
          <div className="glass h-20 animate-pulse rounded-3xl" />
          <div className="glass h-20 animate-pulse rounded-3xl" />
        </div>
      )}

      {loadedOnce && documents.length === 0 && pendingNames.length === 0 && (
        <p className="text-sm text-[var(--muted)]">No uploads yet.</p>
      )}

      {sortedDocs.map((doc) => {
        // Anything with extracted content can be expanded/collapsed — that
        // now includes pending decks other than the one up for review.
        const collapsible = doc.chunkCount > 0;
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
                {collapsible && doc.chunkCount > 0 && (
                  <span className="text-xs font-normal text-[var(--muted)]">· {doc.chunkCount} chunks</span>
                )}
              </div>
              <StatusBadge status={doc.status} hasChunks={doc.chunks.length > 0} />
            </div>

            {isProcessing(doc) && (
              <p className="mt-2 text-xs text-[var(--muted)]">
                ✓ Uploaded — now extracting &amp; chunking in the background. This updates automatically.
              </p>
            )}

            {open && chunksLoadingId === doc.id && doc.chunks.length === 0 && (
              <p className="mt-3 text-xs text-[var(--muted)]">Loading content…</p>
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

            {doc.status === "pending" && doc.chunkCount > 0 && (
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
