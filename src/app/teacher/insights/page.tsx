import Link from "next/link";
import TeacherAnalyticsView from "@/components/analytics/TeacherAnalyticsView";
import TeacherTabs from "@/components/teacher/TeacherTabs";
import { getTeacherAnalytics, getTeacherLearning } from "@/lib/analytics";
import StudentsView from "@/components/analytics/StudentsView";
import { getStudentProgress, getQuestionOutcomes, getAskedAbout } from "@/lib/analytics";
import { ConceptFailurePanel, AskedAboutPanel } from "@/components/analytics/ReteachPanels";
import { requireAtLeast } from "@/lib/auth";
import SessionBadge from "@/components/SessionBadge";

// The analysis, on its own screen.
//
// Eight panels of coverage, difficulty mix and progress are worth reading —
// weekly, deliberately, with time to act on them. They are not worth
// scrolling past every time you want to check whether an upload landed, which
// is what they were doing on the one-page dashboard.
export const dynamic = "force-dynamic";

export default async function TeacherInsightsPage() {
  await requireAtLeast("teacher", "/teacher/insights");
  const [data, learning, progress, outcomes, asked] = await Promise.all([
    getTeacherAnalytics(),
    getTeacherLearning(),
    getStudentProgress(),
    getQuestionOutcomes(),
    getAskedAbout(),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Home</Link>
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          <SessionBadge />
        </div>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
      <p className="mb-6 mt-1 text-[var(--muted)]">
        Coverage, difficulty balance and how your students are doing — counted from your own material.
      </p>

      <TeacherTabs />

      {/* Students first. Coverage and difficulty describe the material; this
          describes the children, and it is the only part of this page a
          teacher can act on the same morning. */}
      {/* Three questions, in the order a teacher asks them: who needs me,
          what did they not understand, what are they confused by. Coverage
          and difficulty describe the material and come after. */}
      <div className="mb-5 space-y-5">
        <StudentsView students={progress.students} now={progress.now} />
        <ConceptFailurePanel outcomes={outcomes} />
        <AskedAboutPanel rows={asked} />
      </div>

      {data ? (
        <TeacherAnalyticsView data={data} learning={learning} />
      ) : (
        <p className="text-sm text-[var(--muted)]">Couldn&apos;t load your figures just now — please refresh.</p>
      )}
    </main>
  );
}
