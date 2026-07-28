"use client";

import { useState } from "react";
import { PRESSABLE } from "@/lib/ui";

export type ClassCode = {
  classId: string;
  section: string;
  subject: string;
  grade: string;
  academicYear: string;
  code: string | null;
  students: number;
};

// The teacher's half of enrolment: one code per section, read out once.
//
// Shown large and spaced, because the realistic delivery mechanism is a
// projector and a room of twelve-year-olds copying it down. The code alphabet
// already excludes 0/O and 1/I/L for the same reason.
export default function ClassCodes({ initial }: { initial: ClassCode[] }) {
  const [rows, setRows] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      {rows.map((row) => (
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

            <button
              onClick={() => rotate(row.classId, Boolean(row.code))}
              disabled={busyId === row.classId}
              className={`rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-50 ${PRESSABLE}`}
            >
              {busyId === row.classId ? "Working…" : row.code ? "New code" : "Create code"}
            </button>
          </div>
        </div>
      ))}

      <p className="text-xs text-[var(--muted)]">
        Students sign in with their school account, then enter this code once. It places them in this section — it is
        not a password, and it does not identify them.
      </p>
    </div>
  );
}
