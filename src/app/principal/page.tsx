import Link from "next/link";
import SchoolAnalyticsView from "@/components/analytics/SchoolAnalyticsView";
import SchoolLanguageView from "@/components/analytics/SchoolLanguageView";
import { getSchoolAnalytics, getSchoolLearning, getSchoolLanguage } from "@/lib/analytics";
import { requireAtLeast } from "@/lib/auth";
import SessionBadge from "@/components/SessionBadge";

export const dynamic = "force-dynamic";

export default async function PrincipalPage() {
  await requireAtLeast("principal", "/principal");
  const [data, learning, language] = await Promise.all([
    getSchoolAnalytics(),
    getSchoolLearning(),
    getSchoolLanguage(),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Home</Link>
        {/* The staff list was SQL-only until 0034, which is what made this
            impossible to hand to a school. It needs to be reachable. */}
        <Link href="/staff" className="ml-4 text-sm text-[var(--muted)] hover:text-[var(--text)]">
          Staff →
        </Link>
        {/* Senior staff often teach as well, and this page has no answer for
            "how is MY class doing" — it is deliberately school-wide. Without
            this link the teaching view was reachable only by typing the URL,
            which is the same as not existing. */}
        <Link href="/teacher" className="ml-4 text-sm text-[var(--muted)] hover:text-[var(--text)]">
          Your teaching →
        </Link>
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
