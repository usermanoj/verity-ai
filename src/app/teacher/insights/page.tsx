import Link from "next/link";
import TeacherAnalyticsView from "@/components/analytics/TeacherAnalyticsView";
import TeacherTabs from "@/components/teacher/TeacherTabs";
import { getTeacherAnalytics, getTeacherLearning } from "@/lib/analytics";
import { requireRole } from "@/lib/auth";
import SessionBadge from "@/components/SessionBadge";

// The analysis, on its own screen.
//
// Eight panels of coverage, difficulty mix and progress are worth reading —
// weekly, deliberately, with time to act on them. They are not worth
// scrolling past every time you want to check whether an upload landed, which
// is what they were doing on the one-page dashboard.
export const dynamic = "force-dynamic";

export default async function TeacherInsightsPage() {
  await requireRole("teacher", "/teacher/insights");
  const [data, learning] = await Promise.all([getTeacherAnalytics(), getTeacherLearning()]);

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

      {data ? (
        <TeacherAnalyticsView data={data} learning={learning} />
      ) : (
        <p className="text-sm text-[var(--muted)]">Couldn&apos;t load your figures just now — please refresh.</p>
      )}
    </main>
  );
}
