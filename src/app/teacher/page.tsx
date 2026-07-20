import Link from "next/link";
import TeacherDashboard from "@/components/teacher/TeacherDashboard";
import { CLASS } from "@/data/monitoring";
import { requireRole } from "@/lib/auth";

export default async function TeacherPage() {
  await requireRole("teacher", "/teacher");
  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Home</Link>
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <span className="rounded-full bg-[rgba(99,102,241,0.18)] px-3 py-1 text-[var(--brand2)]">👩‍🏫 Teacher</span>
        </div>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">AI Monitoring & Progress</h1>
      <p className="mt-1 text-[var(--muted)]">{CLASS.name} — transparent, guided AI use across your class.</p>

      <div className="mt-8">
        <TeacherDashboard />
      </div>
    </main>
  );
}
