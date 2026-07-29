"use client";

import { useState } from "react";
import {
  accuracy,
  byAttention,
  daysSince,
  flagsFor,
  summarise,
  FLAG_LABEL,
  MIN_FOR_RATE,
  type Flag,
  type StudentProgress,
} from "@/lib/student-progress";
import { Panel, Stat } from "./charts";

// One row per student — the screen a teacher actually needs.
//
// Everything on Insights was aggregate: difficulty mix, formats, accuracy by
// section. A teacher opening this on a Monday wants to know who is stuck, who
// has not started, and what they got wrong. None of it was answerable, and
// the only place a pupil's name appeared anywhere in the product was the
// reading-level list.

const FLAG_STYLE: Record<Flag, string> = {
  struggling: "bg-[rgba(248,113,113,0.16)] text-[#fca5a5]",
  not_started: "bg-[rgba(251,191,36,0.16)] text-[#fcd34d]",
  answers_only: "bg-[rgba(99,102,241,0.2)] text-[var(--brand2)]",
  inactive: "bg-[rgba(255,255,255,0.08)] text-[var(--muted)]",
};

const LEVEL_SHORT: Record<StudentProgress["eslLevel"], string> = {
  advanced: "Full",
  intermediate: "Simpler",
  beginner: "Easiest",
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function lastSeen(s: StudentProgress, now: number): string {
  const d = daysSince(s.lastAttemptAt ?? s.lastTutorAt, now);
  if (d === null) return "never";
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  const weeks = Math.floor(d / 7);
  return weeks === 1 ? "last week" : `${weeks} weeks ago`;
}

// Last ten answers, oldest on the left. A total says where a child is; a
// sequence says which way they are going, and that is the thing a teacher
// cannot get from a percentage.
function Sparkline({ marks }: { marks: boolean[] }) {
  if (marks.length === 0) return <span className="text-xs text-[var(--muted)]">—</span>;
  return (
    <span className="inline-flex items-end gap-[3px]" aria-label={`Last ${marks.length} answers`}>
      {marks.map((ok, i) => (
        <span
          key={i}
          title={ok ? "correct" : "wrong"}
          className={`inline-block w-[5px] rounded-[1px] ${ok ? "h-3.5 bg-[#6ee7b7]" : "h-1.5 bg-[#fca5a5]"}`}
        />
      ))}
    </span>
  );
}

type SortKey = "attention" | "name" | "accuracy" | "activity";

export default function StudentProgressTable({
  students,
  now,
  onOpen,
}: {
  students: StudentProgress[];
  // Stamped by the server so every row measures against one instant and the
  // render stays pure.
  now: number;
  onOpen: (id: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>("attention");

  const summary = summarise(students, now);

  const rows =
    sort === "attention"
      ? byAttention(students, now)
      : [...students].sort((a, b) => {
          if (sort === "name") return a.name.localeCompare(b.name);
          if (sort === "activity") {
            const da = daysSince(a.lastAttemptAt ?? a.lastTutorAt, now) ?? Number.MAX_SAFE_INTEGER;
            const db = daysSince(b.lastAttemptAt ?? b.lastTutorAt, now) ?? Number.MAX_SAFE_INTEGER;
            return da - db;
          }
          // Accuracy: the un-quotable sit at the end rather than at zero,
          // because "no rate yet" is not "worst in the class".
          const ra = accuracy(a);
          const rb = accuracy(b);
          if (ra === null && rb === null) return a.name.localeCompare(b.name);
          if (ra === null) return 1;
          if (rb === null) return -1;
          return ra - rb;
        });

  if (students.length === 0) {
    return (
      <Panel title="Your students">
        <p className="text-sm text-[var(--muted)]">
          No students have joined your sections yet. Share a class code and they will appear here.
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={summary.students} hint="in your sections" />
        <Stat label="Active this week" value={summary.activeThisWeek} hint="practised or asked something" />
        <Stat
          label="Median accuracy"
          value={summary.medianAccuracy === null ? "—" : pct(summary.medianAccuracy)}
          // A rate needs a denominator to mean anything, and a median needs
          // enough students to have one.
          hint={
            summary.medianAccuracy === null
              ? `needs ${MIN_FOR_RATE}+ answers from someone`
              : "middle of the class, not the average"
          }
        />
        <Stat
          label="Need you"
          value={summary.needAttention}
          hint={summary.notStarted > 0 ? `${summary.notStarted} not started` : "flagged below"}
          tone={summary.needAttention > 0 ? "warn" : "good"}
        />
      </div>

      <Panel
        title="Your students"
        hint="Ordered by who needs you first. Click a name for their wrong answers and what they asked the assistant."
      >
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {(["attention", "name", "accuracy", "activity"] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              aria-pressed={sort === k}
              className={`rounded-lg border px-2.5 py-1 transition ${
                sort === k
                  ? "border-[var(--brand)] bg-[rgba(99,102,241,0.18)] text-[var(--text)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {k === "attention" ? "Needs me" : k === "name" ? "Name" : k === "accuracy" ? "Accuracy" : "Last active"}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr className="border-b border-[var(--border)]">
                <th className="px-2 py-2">Student</th>
                <th className="px-2 py-2 text-right">Answered</th>
                <th className="px-2 py-2 text-right">Accuracy</th>
                <th className="px-2 py-2">Last 10</th>
                <th className="px-2 py-2">Last active</th>
                <th className="px-2 py-2">Reading</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const rate = accuracy(s);
                const flags = flagsFor(s, now);
                return (
                  <tr key={s.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]">
                    <td className="px-2 py-2">
                      <button
                        onClick={() => onOpen(s.id)}
                        className="text-left font-medium text-[var(--text)] hover:text-[var(--brand2)] hover:underline"
                      >
                        {s.name}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="text-[11px] text-[var(--muted)]">{s.sections.join(", ")}</span>
                        {flags.map((f) => (
                          <span key={f} className={`rounded-full px-1.5 py-0.5 text-[10px] ${FLAG_STYLE[f]}`}>
                            {FLAG_LABEL[f]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{s.attempts}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {rate === null ? (
                        <span
                          className="text-[var(--muted)]"
                          title={`A percentage needs at least ${MIN_FOR_RATE} answers to mean anything`}
                        >
                          —
                        </span>
                      ) : (
                        pct(rate)
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Sparkline marks={s.recent} />
                    </td>
                    <td className="px-2 py-2 text-[var(--muted)]">{lastSeen(s, now)}</td>
                    <td className="px-2 py-2 text-[var(--muted)]">
                      {LEVEL_SHORT[s.eslLevel]}
                      {s.eslChinese && <span className="ml-1 text-[var(--brand2)]">中文</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
