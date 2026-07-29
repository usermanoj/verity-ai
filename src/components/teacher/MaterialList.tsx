import Link from "next/link";

// What the teacher has actually uploaded, by name.
//
// The dashboard reported "3 live to students, 1 waiting on you" and never
// named a single document. After re-uploading a deck there was no way to tell
// from this page which file had arrived, which grade it reached, or whether
// the new version was the one students could see — the counts moved and
// nothing else did.
//
// Newest first, because the question being asked here is almost always "did
// the thing I just did work?".

export type MaterialRow = {
  id: string;
  title: string;
  subject: string;
  grade: string;
  sections: string[];
  status: "pending" | "approved" | "rejected";
  version: number;
  // Preformatted upstream so this component does no clock reading of its own.
  age: string;
};

const STATUS: Record<MaterialRow["status"], { label: string; className: string }> = {
  approved: { label: "Live to students", className: "bg-[rgba(52,211,153,0.16)] text-[#6ee7b7]" },
  pending: { label: "Waiting on you", className: "bg-[rgba(251,191,36,0.16)] text-[#fcd34d]" },
  rejected: { label: "Rejected", className: "bg-[rgba(255,255,255,0.08)] text-[var(--muted)]" },
};

// Relative, because "2 minutes ago" answers "is this the one I just
// uploaded?" and a timestamp doesn't.
export function relativeTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((now - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function MaterialList({ rows }: { rows: MaterialRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        Nothing uploaded yet. <Link href="/teacher/ingest" className="text-[var(--brand2)] hover:underline">Add your first material →</Link>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const status = STATUS[row.status];
        return (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] px-4 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{row.title}</span>
                {row.version > 1 && (
                  <span
                    title="An earlier version of this file is kept as history"
                    className="rounded-full bg-[rgba(99,102,241,0.18)] px-2 py-0.5 text-[11px] text-[var(--brand2)]"
                  >
                    v{row.version}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">
                {[row.subject, row.grade].filter(Boolean).join(" · ") || "No class yet"}
                {row.sections.length > 0 && ` · ${row.sections.join(", ")}`}
                {" · "}
                {row.age}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2.5 py-1 text-[11px] ${status.className}`}>{status.label}</span>
              {/* Only approved documents have a student-facing page; linking
                  a pending one would 404 through notFound(). */}
              {row.status === "approved" ? (
                <Link href={`/topics/${row.id}`} className="text-xs text-[var(--brand2)] hover:underline">
                  Open →
                </Link>
              ) : (
                <Link href="/teacher/ingest" className="text-xs text-[var(--brand2)] hover:underline">
                  Review →
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
