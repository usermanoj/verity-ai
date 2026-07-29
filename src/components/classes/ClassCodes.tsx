"use client";

import { useEffect, useState } from "react";
import { PRESSABLE } from "@/lib/ui";

export type ClassCode = {
  classId: string;
  section: string;
  subject: string;
  grade: string;
  academicYear: string;
  code: string | null;
  students: number;
  // Titles of the approved, current documents that reach this section.
  // Optional so a response from before migration 0027 renders without a
  // warning rather than a wrong one.
  materials?: string[];
};

// The teacher's half of enrolment: one code per section, read out once.
//
// Shown large and spaced, because the realistic delivery mechanism is a
// projector and a room of twelve-year-olds copying it down. The code alphabet
// already excludes 0/O and 1/I/L for the same reason.
export default function ClassCodes({
  initial,
  qrFor,
}: {
  initial: ClassCode[];
  // Rendered on the server (JoinQr needs the request's origin and the qrcode
  // library), passed in per class so this component stays a client component
  // without pulling an encoder into the browser bundle.
  qrFor?: Record<string, React.ReactNode>;
}) {
  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Which class's QR is on screen. This used to be a <details> whose summary
  // always read "Show QR" — it did toggle, but nothing said so, and clicking
  // anywhere else left the panel floating over the row beneath it. One open
  // at a time, and every ordinary way of dismissing a popover works.
  const [qrOpen, setQrOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!qrOpen) return;
    const close = () => setQrOpen(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Capture phase, so the toggle button's own click doesn't immediately
    // reopen what this just closed.
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [qrOpen]);

  async function rotate(classId: string, hadCode: boolean) {
    // Replacing a live code cuts off a code that may be written on a
    // whiteboard right now. Students already enrolled keep their access —
    // their enrolment is a separate record — but anyone mid-join is stranded,
    // so the confirmation names that rather than asking a vague "are you sure".
    if (hadCode && !confirm("Replace this code? The old one stops working immediately. Students who already joined keep their access.")) {
      return;
    }
    setBusyId(classId);
    setError(null);
    try {
      const res = await fetch("/api/classes/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId }),
      });
      const data = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !data.code) {
        setError(data.error ?? "Couldn't create a code — please try again.");
        return;
      }
      setRows((prev) => prev.map((r) => (r.classId === classId ? { ...r, code: data.code! } : r)));
    } catch {
      setError("Couldn't create a code — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be refused; the code is on screen regardless.
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No sections yet. Upload material for a class and it will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-[var(--warn)]">{error}</p>}

      {rows.map((row) => {
        const materials = row.materials ?? [];
        return (
        <div
          key={row.classId}
          className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--border)] p-4"
        >
          <div className="min-w-0">
            <div className="font-medium">
              {row.grade} {row.subject} · {row.section}
            </div>
            <div className="text-xs text-[var(--muted)]">
              {row.academicYear} · {row.students} student{row.students === 1 ? "" : "s"} joined
            </div>

            {/* What actually reaches this section, by name.
                A warning that only appears when something is wrong teaches
                nobody where things are: looking at "7C" there was no way to
                know that is where the Magnets deck went. Listing what a
                section HAS is what makes its absence mean something. */}
            <div className="mt-1.5 text-xs">
              {materials.length > 0 ? (
                <span className="text-[var(--muted)]">
                  📘 {materials.join(" · ")}
                </span>
              ) : row.students > 0 ? (
                <span
                  title="These students have joined but no approved document reaches this section — they open the app to an empty page."
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.12)] px-2 py-1 text-[11px] text-[#fcd34d]"
                >
                  ⚠ No material — these students see an empty page
                </span>
              ) : (
                <span className="text-[var(--muted)] opacity-70">No material yet</span>
              )}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {row.code ? (
              <button
                onClick={() => copy(row.code!)}
                title="Copy to clipboard"
                className={`rounded-xl bg-black/30 px-4 py-2 font-mono text-lg tracking-[0.25em] ${PRESSABLE}`}
              >
                {copied === row.code ? "Copied" : row.code}
              </button>
            ) : (
              <span className="text-sm text-[var(--muted)]">No code yet</span>
            )}

            {row.code && qrFor?.[row.classId] ? (
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  aria-expanded={qrOpen === row.classId}
                  onClick={() => setQrOpen(qrOpen === row.classId ? null : row.classId)}
                  className={`rounded-xl border px-3 py-2 text-xs ${PRESSABLE} ${
                    qrOpen === row.classId
                      ? "border-[var(--brand)] text-[var(--text)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {qrOpen === row.classId ? "✕ Hide QR" : "▸ Show QR"}
                </button>
                {qrOpen === row.classId && (
                  <div className="absolute right-0 z-10 mt-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-2)] p-3 shadow-2xl">
                    {qrFor[row.classId]}
                    <p className="mt-2 max-w-[9rem] text-[11px] leading-snug text-[var(--muted)]">
                      Project this. Students scan, sign in, and the code is already filled in.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            <button
              onClick={() => rotate(row.classId, Boolean(row.code))}
              disabled={busyId === row.classId}
              className={`rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50 ${PRESSABLE}`}
            >
              {busyId === row.classId ? "Working…" : row.code ? "New code" : "Create code"}
            </button>
          </div>
        </div>
        );
      })}

      <p className="text-xs text-[var(--muted)]">
        Students sign in with their school account, then enter this code once. It places them in this section — it is
        not a password, and it does not identify them.
      </p>
    </div>
  );
}
