import Link from "next/link";
import SchoolAnalyticsView from "@/components/analytics/SchoolAnalyticsView";
import { getSchoolAnalytics } from "@/lib/analytics";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PrincipalPage() {
  await requireRole("principal", "/principal");
  const data = await getSchoolAnalytics();

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Home</Link>
        <span className="rounded-full bg-[rgba(99,102,241,0.18)] px-3 py-1 text-sm text-[var(--brand2)]">🏫 Principal</span>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">School dashboard</h1>
      <p className="mt-1 text-[var(--muted)]">
        Adoption across subjects and year groups, and where the curriculum is still thin.
      </p>

      <div className="mt-8">
        {data ? (
          <SchoolAnalyticsView data={data} scope="school" />
        ) : (
          <p className="text-sm text-[var(--muted)]">Couldn&apos;t load the figures just now — please refresh.</p>
        )}
      </div>
    </main>
  );
}
