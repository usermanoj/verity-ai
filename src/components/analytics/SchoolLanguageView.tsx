import { Panel, Stat, StackedBar } from "./charts";
import type { SchoolLanguage } from "@/lib/analytics";

// Language support, rolled up.
//
// A teacher sets one child's reading level and corrects the Chinese on one
// document. Neither reached the people who decide where a teaching assistant
// goes. This is that view: where the need actually sits, and how much of the
// AI's Chinese the school is having to correct.

export default function SchoolLanguageView({
  data,
  scope,
}: {
  data: SchoolLanguage;
  scope: "department" | "school";
}) {
  const { levels, students, chinese, unassessed } = data;

  // Percentages of a handful of students say more than they know. Below about
  // twenty, the count is the honest presentation.
  const share = (n: number) => (students >= 20 ? `${Math.round((n / students) * 100)}% of students` : `of ${students}`);

  const glossaryPct =
    data.glossary.total > 0 ? Math.round((data.glossary.edited / data.glossary.total) * 100) : null;
  const translationPct =
    data.translations.total > 0
      ? Math.round((data.translations.corrected / data.translations.total) * 100)
      : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={students} hint={`across your ${scope}`} />
        <Stat label="Reading at the easiest level" value={levels.beginner} hint={share(levels.beginner)} />
        <Stat label="Using Chinese support" value={chinese} hint={share(chinese)} />
        {/* The number that should prompt action. A default is not a
            judgement, and a report that presents it as one flatters the
            school — these are the children nobody has assessed. */}
        <Stat
          label="Not yet assessed"
          value={unassessed}
          hint="still on the default level"
          tone={unassessed > 0 ? "warn" : "good"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Reading levels"
          hint="How hard the assistant's English is set for each student. Teachers set this; students can change their own."
        >
          {students === 0 ? (
            <p className="text-sm text-[var(--muted)]">No students enrolled yet.</p>
          ) : (
            <StackedBar
              // StackedBar colours its own segments from SERIES and
              // direct-labels each one, so identity is never colour alone.
              segments={[
                { label: "Full English", value: levels.advanced },
                { label: "Simpler", value: levels.intermediate },
                { label: "Easiest", value: levels.beginner },
              ]}
            />
          )}
        </Panel>

        <Panel
          title="How much AI Chinese is being corrected"
          hint="Teachers can edit any generated gloss or translation. A high number is a signal about the AI, not about the teachers."
        >
          <div className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[var(--muted)]">Vocabulary entries edited</span>
              <span className="font-medium tabular-nums">
                {data.glossary.edited}
                <span className="text-[var(--muted)]"> / {data.glossary.total}</span>
                {glossaryPct !== null && <span className="ml-2 text-xs text-[var(--muted)]">{glossaryPct}%</span>}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[var(--muted)]">Translations replaced</span>
              <span className="font-medium tabular-nums">
                {data.translations.corrected}
                <span className="text-[var(--muted)]"> / {data.translations.total}</span>
                {translationPct !== null && <span className="ml-2 text-xs text-[var(--muted)]">{translationPct}%</span>}
              </span>
            </div>
            {data.glossary.total === 0 && data.translations.total === 0 && (
              <p className="text-[var(--muted)]">
                Nothing generated yet — vocabulary and translations are produced when a document is approved.
              </p>
            )}
          </div>
        </Panel>
      </div>

      <Panel
        title="Where the need sits"
        hint="Sections with the highest share reading at the easiest level, first. This is the list to read when deciding where support goes."
      >
        {data.sections.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No sections with enrolled students yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="px-3 py-2">Section</th>
                  <th className="px-3 py-2 text-right">Students</th>
                  <th className="px-3 py-2 text-right">Easiest English</th>
                  <th className="px-3 py-2 text-right">Chinese</th>
                  <th className="px-3 py-2 text-right">Not assessed</th>
                </tr>
              </thead>
              <tbody>
                {data.sections.map((s) => (
                  <tr
                    key={`${s.grade}-${s.section}-${s.subject}`}
                    className="border-b border-[var(--border)] last:border-0"
                  >
                    <td className="px-3 py-2">
                      <span className="font-medium">
                        {s.grade} · {s.section}
                      </span>
                      <span className="ml-2 text-xs text-[var(--muted)]">{s.subject}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.students}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.beginner}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.chinese}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${s.unassessed > 0 ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}
                    >
                      {s.unassessed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
