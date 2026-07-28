import { BarList, Locked, Panel, Stat, Trend } from "./charts";
import type { SchoolAnalytics } from "@/lib/analytics";

// The oversight view. A head of department or principal is not marking work;
// they are answering "is this actually being adopted, and where is it thin".
//
// `scope` only changes the framing, not the figures — both roles read the
// same school. A principal reading a subject-level breakdown and an HOD
// reading the same one are asking the same question at different altitudes.
export default function SchoolAnalyticsView({
  data,
  scope,
}: {
  data: SchoolAnalytics;
  scope: "department" | "school";
}) {
  const totalSections = data.coverage.reduce((n, c) => n + c.sections, 0);
  const coveredSections = data.coverage.reduce((n, c) => n + c.covered, 0);
  const coveragePct = totalSections === 0 ? 0 : Math.round((coveredSections / totalSections) * 100);

  const participation =
    data.teachers.total === 0 ? 0 : Math.round((data.teachers.contributing / data.teachers.total) * 100);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Curriculum covered"
          value={`${coveragePct}%`}
          hint={`${coveredSections} of ${totalSections} sections have approved material`}
          tone={coveragePct >= 60 ? "good" : "warn"}
        />
        <Stat
          label="Teachers contributing"
          value={`${data.teachers.contributing} / ${data.teachers.total}`}
          hint={`${participation}% have material live`}
          tone={participation >= 50 ? "good" : "warn"}
        />
        <Stat label="Documents live" value={data.documents.approved} hint="approved across the school" />
        <Stat
          label="Awaiting review"
          value={data.documents.pending + data.questionsPending}
          hint={`${data.documents.pending} document${data.documents.pending === 1 ? "" : "s"} · ${data.questionsPending} question${data.questionsPending === 1 ? "" : "s"}`}
          tone={data.documents.pending + data.questionsPending > 0 ? "warn" : "default"}
        />
      </div>

      <Panel
        title="Coverage by subject and year"
        hint="Sections reached by approved material. The gap is the number of classes with nothing."
      >
        {data.coverage.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No courses set up yet.</p>
        ) : (
          <BarList
            data={data.coverage.map((c) => ({
              label: `${c.grade} ${c.subject}`,
              value: c.covered,
              secondary: c.sections,
            }))}
            valueLabel="sections covered"
            secondaryLabel="sections"
          />
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={scope === "school" ? "By teacher" : "Teachers in the department"} hint="Approved documents each.">
          {data.byTeacher.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No teachers registered yet.</p>
          ) : (
            <BarList
              data={data.byTeacher.map((t) => ({ label: t.name, value: t.approved }))}
              valueLabel="approved documents"
            />
          )}
        </Panel>

        <Panel title="Material added" hint="Last twelve weeks, school-wide.">
          <Trend points={data.weekly} />
        </Panel>
      </div>

      <Locked title="Learning outcomes" needs="student sign-in">
        Attainment by class, topics a year group consistently struggles with, whether the assistant is being used to
        learn or to shortcut — these are the numbers this role most wants, and every one of them requires student work
        to be attributable. Until students sign in, nothing is recorded, so nothing is estimated here.
      </Locked>
    </div>
  );
}
