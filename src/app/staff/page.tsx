import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSignedIn } from "@/lib/auth";
import { getStaffList } from "@/lib/staff-repo";
import StaffManager from "@/components/staff/StaffManager";
import SessionBadge from "@/components/SessionBadge";
import { hasSupabase } from "@/lib/supabase/config";

// Who works here, and who may say so.
//
// Until now this table could only be edited by hand in the SQL editor, which
// meant a school could not add a teacher without someone holding database
// credentials — the single thing that made this impossible to hand over.
//
// Its own route rather than a tab under /teacher or /principal, because two
// different roles need it and neither owns it.

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const user = await requireSignedIn("/staff");

  // requireSignedIn returns null without Supabase (preview builds stay in demo
  // mode). There is nothing meaningful to show there.
  if (hasSupabase() && user && user.role !== "principal" && user.role !== "hod") {
    redirect("/");
  }

  const grants = user ? await getStaffList() : [];

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Everyone who can see your students&apos; work. Adding someone here gives them that access the next time
            they sign in.
          </p>
        </div>
        <SessionBadge />
      </div>

      <nav className="mb-6">
        <Link href={user?.role === "principal" ? "/principal" : "/hod"} className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
          ← Back to your dashboard
        </Link>
      </nav>

      {user ? (
        <StaffManager grants={grants} actorRole={user.role} />
      ) : (
        <p className="text-sm text-[var(--muted)]">Staff management needs a configured deployment.</p>
      )}

      <p className="mt-8 text-xs text-[var(--muted)]">
        Access is per person, never by email domain. At a school where students and staff share a domain, a domain rule
        would hand every class&apos;s transcripts to any pupil who signed in.
      </p>
    </main>
  );
}
