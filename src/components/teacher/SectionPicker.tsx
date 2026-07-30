"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRESSABLE } from "@/lib/ui";

// Changing which classes a deck reaches.
//
// Until now this was set once at upload and could never be corrected. A teacher
// who picked the wrong section had to re-upload the file, wait for extraction,
// and approve every generated question again — so in practice nobody corrected
// anything, and sections quietly drifted out of sync with what was actually
// being taught.
//
// Deliberately in the material list rather than on its own screen. The list is
// where a teacher already reads "this deck goes to 7B", and the moment you
// notice that is wrong is the moment you want to change it.

export type ClassOption = { classId: string; section: string; subject: string; grade: string; students: number };

export default function SectionPicker({
  documentId,
  classIds,
  options,
}: {
  documentId: string;
  classIds: string[];
  options: ClassOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set(classIds));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (options.length === 0) return null;

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/materials/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, classIds: [...chosen] }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't save that.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network problem — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setChosen(new Set(classIds));
          setError(null);
          setOpen(true);
        }}
        className={`rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)] ${PRESSABLE}`}
      >
        Change sections
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-[var(--border)] p-3">
      <div className="text-xs text-[var(--muted)]">Which of your sections should see this?</div>

      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = chosen.has(o.classId);
          return (
            <label
              key={o.classId}
              className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs ${
                on ? "border-[var(--brand)] bg-[rgba(99,102,241,0.16)] text-[var(--text)]" : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              <input type="checkbox" checked={on} onChange={() => toggle(o.classId)} className="mr-2 align-middle" />
              {o.section}
              {/* Enrolment shown because "which section" is really "which
                  children", and a section with nobody in it is a common and
                  invisible mistake — it looks identical to a section that is
                  working. */}
              <span className="ml-1.5 text-[var(--muted)]">
                {o.students === 0 ? "no students" : `${o.students} student${o.students === 1 ? "" : "s"}`}
              </span>
            </label>
          );
        })}
      </div>

      {/* Said plainly, because unticking everything is allowed and its effect is
          not obvious from a row of empty boxes. */}
      {chosen.size === 0 && (
        <p className="mt-2 text-xs text-[var(--warn)]">No sections selected — no students will see this material.</p>
      )}
      {error && <p className="mt-2 text-xs text-[var(--warn)]">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={save}
          disabled={busy}
          className={`rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 ${PRESSABLE}`}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className={`rounded-lg px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)] ${PRESSABLE}`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
