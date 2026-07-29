import Link from "next/link";
import SchoolAnalyticsView from "@/components/analytics/SchoolAnalyticsView";
import SchoolLanguageView from "@/components/analytics/SchoolLanguageView";
import { getSchoolAnalytics, getSchoolLearning, getSchoolLanguage } from "@/lib/analytics";
import { requireRole } from "@/lib/auth";
import SessionBadge from "@/components/SessionBadge";

export const dynamic = "force-dynamic";

export default async function HodPage() {
  await requireRole("hod", "/hod");
  const [data, learning, language] = await Promise.all([
    getSchoolAnalytics(),
    getSchoolLearning(),
    getSchoolLanguage(),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Home</Link>
        <SessionBadge />
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Department readiness</h1>
      <p className="mt-1 text-[var(--muted)]">
        Curriculum coverage, who is contributing, and what is waiting on review.
      </p>

      {/* Language support first: coverage and progress describe the material,
          this describes the children — and it is the one section here that
          names an action for this week. */}
      <div className="mt-8 space-y-5">
        {language ? (
          <SchoolLanguageView data={language} scope="department" />
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Language support figures aren&apos;t available — this needs migration 0025.
          </p>
        )}
      </div>

      <div className="mt-5">
        {data ? (
          <SchoolAnalyticsView data={data} learning={learning} scope="department" />
        ) : (
          <p className="text-sm text-[var(--muted)]">Couldn&apos;t load the figures just now — please refresh.</p>
        )}
      </div>
    </main>
  );
}
