"use client";

import { useState } from "react";

// Reading levels, set by the teacher.
//
// The two controls live in the student's tutor panel, which assumes a child
// knows they need the easiest English, knows where the dropdown is, and finds
// it again on every device. The adult who actually knows is the one who has
// been teaching them, and until now they had no way to say so.

export type StudentRow = {
  id: string;
  name: string;
  level: "advanced" | "intermediate" | "beginner";
  chinese: boolean;
  setByTeacher: boolean;
  sections: string[];
};

const LEVELS: { id: StudentRow["level"]; label: string }[] = [
  { id: "advanced", label: "Full English" },
  { id: "intermediate", label: "Simpler English" },
  { id: "beginner", label: "Easiest English" },
];

export default function StudentLanguage({ students }: { students: StudentRow[] }) {
  const [rows, setRows] = useState(students);
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  async function save(id: string, patch: { level?: StudentRow["level"]; chinese?: boolean }) {
    setSaving(id);
    setFailed(null);
    // Applied immediately: the teacher is going down a class list, and a
    // dropdown that waits for a round trip before showing the new value makes
    // twenty students feel like a form.
    setRows((r) => r.map((s) => (s.id === id ? { ...s, ...patch, setByTeacher: true } : s)));
    try {
      const res = await fetch("/api/language/level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: id, ...patch }),
      });
      if (!res.ok) {
        setFailed(id);
        // Put it back. A control that shows a setting the server rejected is
        // worse than one that never moved.
        setRows((r) => r.map((s) => (s.id === id ? students.find((o) => o.id === id) ?? s : s)));
      }
    } catch {
      setFailed(id);
      setRows((r) => r.map((s) => (s.id === id ? students.find((o) => o.id === id) ?? s : s)));
    } finally {
      setSaving(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No students have joined your classes yet. Once they join with a code, they appear here.
      </p>
    );
  }

  const untouched = rows.filter((r) => !r.setByTeacher).length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted)]">
        How hard the assistant makes its English for each student, and whether it adds a 中文 gloss. Follows them to
        any device. Students can change their own; your setting replaces it.
        {untouched > 0 && (
          <>
            {" "}
            <span className="text-[var(--warn)]">
              {untouched} still on the default — worth a look if you know their English.
            </span>
          </>
        )}
      </p>

      <div className="space-y-2">
        {rows.map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{s.name}</span>
                {!s.setByTeacher && (
                  <span className="rounded-full bg-[rgba(255,255,255,0.08)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                    default
                  </span>
                )}
                {saving === s.id && <span className="text-[11px] text-[var(--muted)]">saving…</span>}
                {failed === s.id && <span className="text-[11px] text-[var(--warn)]">couldn&apos;t save</span>}
              </div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{s.sections.join(", ")}</div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={s.level}
                onChange={(e) => save(s.id, { level: e.target.value as StudentRow["level"] })}
                aria-label={`Reading level for ${s.name}`}
                className="glass rounded-xl px-2 py-1.5 text-xs outline-none"
              >
                {LEVELS.map((l) => (
                  <option key={l.id} value={l.id} className="bg-[#0e1530]">
                    {l.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => save(s.id, { chinese: !s.chinese })}
                aria-pressed={s.chinese}
                aria-label={`Chinese glosses for ${s.name}`}
                title="Add a short Chinese gloss after key sentences and technical terms"
                className={`rounded-xl border px-2.5 py-1.5 text-xs transition ${
                  s.chinese
                    ? "border-[var(--brand)] bg-[rgba(99,102,241,0.2)] text-[var(--text)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                中文
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
