import Link from "next/link";
import ClassCodes from "@/components/classes/ClassCodes";
import TeacherTabs from "@/components/teacher/TeacherTabs";
import { Panel } from "@/components/analytics/charts";
import { requireRole } from "@/lib/auth";
import SessionBadge from "@/components/SessionBadge";
import { getClassCodes, joinQrs } from "@/lib/teacher-classes";

// Enrolment, on its own screen.
//
// Class codes are a once-a-term job — set up in September, occasionally
// rotated — and they were sitting above the uploads list, which is a daily
// one. On a real timetable that pushed the day's work below the fold.
export const dynamic = "force-dynamic";

export default async function TeacherClassesPage() {
  await requireRole("teacher", "/teacher/classes");
  const codes = await getClassCodes();

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Home</Link>
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          <SessionBadge />
        </div>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Classes</h1>
      <p className="mb-6 mt-1 text-[var(--muted)]">How your students get in, and who has joined so far.</p>

      <TeacherTabs />

      <Panel title="Class codes" hint="Students sign in with their school account, then enter a code once to join a section.">
        <ClassCodes initial={codes} qrFor={await joinQrs(codes)} />
      </Panel>
    </main>
  );
}
