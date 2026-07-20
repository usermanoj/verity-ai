import Link from "next/link";
import HodDashboard from "@/components/hod/HodDashboard";
import { requireRole } from "@/lib/auth";

export default async function HodPage() {
  await requireRole("hod", "/hod");
  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Home</Link>
        <span className="rounded-full bg-[rgba(99,102,241,0.18)] px-3 py-1 text-sm text-[var(--brand2)]">📊 HOD</span>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Department Analytics</h1>
      <p className="mt-1 text-[var(--muted)]">Physics department — curriculum coverage, engagement, and progress across all sections.</p>

      <div className="mt-8">
        <HodDashboard />
      </div>
    </main>
  );
}
