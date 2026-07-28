import Link from "next/link";
import TeacherAnalyticsView from "@/components/analytics/TeacherAnalyticsView";
import { getTeacherAnalytics } from "@/lib/analytics";
import { requireRole } from "@/lib/auth";

// Auth-gated: never prerender. The auth helpers read cookies at request
// time, but bail out early when Supabase env vars are absent — so a build
// without them (preview branches, where those vars are deliberately not set)
// would otherwise prerender this as a STATIC, auth-skipped snapshot.
export const dynamic = "force-dynamic";

export default async function TeacherPage() {
  await requireRole("teacher", "/teacher");
  const data = await getTeacherAnalytics();

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Home</Link>
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          <Link href="/teacher/ingest" className="glass rounded-full px-3 py-1 hover:text-[var(--text)]">📤 Upload material</Link>
          <span className="rounded-full bg-[rgba(99,102,241,0.18)] px-3 py-1 text-[var(--brand2)]">👩‍🏫 Teacher</span>
        </div>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Your teaching material</h1>
      <p className="mt-1 text-[var(--muted)]">
        What your students can see, what is waiting on you, and where the gaps are.
      </p>

      <div className="mt-8">
        {data ? (
          <TeacherAnalyticsView data={data} />
        ) : (
          <p className="text-sm text-[var(--muted)]">Couldn&apos;t load your figures just now — please refresh.</p>
        )}
      </div>
    </main>
  );
}
