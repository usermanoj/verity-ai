import Link from "next/link";
import SchoolAnalyticsView from "@/components/analytics/SchoolAnalyticsView";
import SchoolLanguageView from "@/components/analytics/SchoolLanguageView";
import { getSchoolAnalytics, getSchoolLearning, getSchoolLanguage } from "@/lib/analytics";
import { requireRole } from "@/lib/auth";
import SessionBadge from "@/components/SessionBadge";

export const dynamic = "force-dynamic";

export default async function PrincipalPage() {
  await requireRole("principal", "/principal");
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

      <h1 className="text-3xl font-bold tracking-tight">School dashboard</h1>
      <p className="mt-1 text-[var(--muted)]">
        Adoption across subjects and year groups, and where the curriculum is still thin.
      </p>

      {/* Language support first: coverage and progress describe the material,
          this describes the children — and it is the one section here that
          names an action for this week. */}
      <div className="mt-8 space-y-5">
        {language ? (
          <SchoolLanguageView data={language} scope="school" />
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Language support figures aren&apos;t available — this needs migration 0025.
          </p>
        )}
      </div>

      <div className="mt-5">
        {data ? (
          <SchoolAnalyticsView data={data} learning={learning} scope="school" />
        ) : (
          <p className="text-sm text-[var(--muted)]">Couldn&apos;t load the figures just now — please refresh.</p>
        )}
      </div>
    </main>
  );
}
