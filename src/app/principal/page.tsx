import Link from "next/link";
import PrincipalDashboard from "@/components/principal/PrincipalDashboard";
import { requireRole } from "@/lib/auth";

export default async function PrincipalPage() {
  await requireRole("principal", "/principal");
  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Home</Link>
        <span className="rounded-full bg-[rgba(99,102,241,0.18)] px-3 py-1 text-sm text-[var(--brand2)]">🏫 Principal</span>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">School Dashboard</h1>
      <p className="mt-1 text-[var(--muted)]">Subject performance, completion, AI usage, and ESL improvement across the school.</p>

      <div className="mt-8">
        <PrincipalDashboard />
      </div>
    </main>
  );
}
