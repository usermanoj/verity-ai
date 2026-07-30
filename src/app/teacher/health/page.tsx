import TeacherTabs from "@/components/teacher/TeacherTabs";
import SessionBadge from "@/components/SessionBadge";
import { requireAtLeast } from "@/lib/auth";
import { getRecordedErrors } from "@/lib/errors/read";
import { Panel } from "@/components/analytics/charts";

// What has gone wrong, where a person can see it.
//
// Everything on this page used to be a `catch {}`. The failures were real and
// the product simply carried on: a transcript row not saved, an engagement
// event dropped, a question deck published without being checked. Each was the
// right thing to do for the child in front of the screen and the wrong thing to
// do for whoever has to fix it.
//
// Under Teacher rather than Principal on purpose. A principal will not read
// this, and the person who needs it is whoever is looking after the deployment
// — who signs in as a teacher.

export const dynamic = "force-dynamic";

const AREA_MEANING: Record<string, string> = {
  tutor: "The AI assistant",
  translate: "Chinese translation",
  "ai-usage": "The daily usage counter",
  ingest: "Uploading and approving material",
  questions: "Generating and checking questions",
  analytics: "The figures on Insights",
  conversations: "Saving what students asked",
  events: "Recording engagement",
  language: "Reading level and Chinese settings",
  auth: "Signing in",
};

export default async function TeacherHealthPage() {
  await requireAtLeast("teacher", "/teacher/health");
  const errors = await getRecordedErrors();
  const total = errors.reduce((n, e) => n + e.count, 0);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Health</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Problems the app ran into over the last 7 days. Students were not shown any of these — the app carried
            on — which is exactly why they need somewhere to be seen.
          </p>
        </div>
        <SessionBadge />
      </div>

      <TeacherTabs />

      <Panel
        title="Recorded problems"
        hint={
          errors.length === 0
            ? undefined
            : `${total} occurrence${total === 1 ? "" : "s"} across ${errors.length} distinct problem${errors.length === 1 ? "" : "s"}, most frequent first.`
        }
      >
        {errors.length === 0 ? (
          // Said carefully. "Nothing has gone wrong" and "nothing has been
          // recorded" are different claims, and before migration 0033 ran the
          // second was true while the first was not.
          <p className="text-sm text-[var(--muted)]">
            Nothing recorded in the last 7 days. That means no failure has been reported since this started
            recording — not that the app has never had one.
          </p>
        ) : (
          <div className="space-y-3">
            {errors.map((e) => (
              <div key={`${e.fingerprint}-${e.day}`} className="rounded-2xl border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{AREA_MEANING[e.area] ?? e.area}</span>
                  <span className="text-sm tabular-nums text-[#fca5a5]">
                    {e.count}×
                    <span className="ml-2 text-[var(--muted)]">{e.day}</span>
                  </span>
                </div>
                <p className="mt-1.5 break-words text-sm">{e.message}</p>
                {e.detail && (
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-[rgba(0,0,0,0.25)] p-3 text-[11px] leading-relaxed text-[var(--muted)]">
                    {e.detail}
                  </pre>
                )}
                <p className="mt-2 text-[11px] text-[var(--muted)]">
                  first {e.firstSeen.slice(11, 19)} · last {e.lastSeen.slice(11, 19)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <p className="mt-4 text-xs text-[var(--muted)]">
        Messages have email addresses, ids and keys stripped before they are stored, and a repeated fault is one row
        with a count rather than many rows.
      </p>
    </main>
  );
}
