import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabase } from "@/lib/supabase/config";
import { getTeacherIngestState } from "@/lib/ingestion/documents";
import IngestPanel from "@/components/teacher/IngestPanel";
import TeacherTabs from "@/components/teacher/TeacherTabs";
import { atLeast, seniorHomeFor } from "@/lib/roles";

// Auth-gated: never prerender. The auth helpers read cookies at request
// time, but bail out early when Supabase env vars are absent — so a build
// without them (preview branches, where those vars are deliberately not set)
// would otherwise prerender this as a STATIC, auth-skipped snapshot.
export const dynamic = "force-dynamic";

export default async function TeacherIngestPage() {
  // ONE round trip for the whole page: the RPC returns the caller's role
  // (the auth gate) *and* their documents together, so the uploads list is
  // in the initial HTML.
  //
  // This reverses an earlier change that moved the list to a client fetch.
  // That was right when the list cost five blocking queries — but it created
  // a waterfall: HTML (4ms) → download/parse ~450 kB of JS (4.1s) → hydrate →
  // fetch the list (1.5s) → only then show anything. Content appeared ~5.5s
  // in, despite the server answering in 4ms. Rendering it server-side puts
  // the content on screen as soon as the HTML lands, exactly like the
  // homepage, and the JS hydrates behind it for interactivity.
  if (!hasSupabase()) {
    return (
      <Shell>
        <div className="glass mt-8 rounded-3xl p-6 text-sm text-[var(--muted)]">
          Uploads aren&apos;t configured for this deployment yet — Supabase env vars aren&apos;t set.
        </div>
      </Shell>
    );
  }

  const { user, documents } = await getTeacherIngestState();
  if (!user) redirect(`/login?next=${encodeURIComponent("/teacher/ingest")}`);
  if (!atLeast(user.role, "teacher")) redirect("/");

  return (
    <Shell seniorHome={seniorHomeFor(user.role)}>
      <div className="mt-8">
        <IngestPanel initialDocuments={documents} />
      </div>
    </Shell>
  );
}

function Shell({ children, seniorHome }: { children: React.ReactNode; seniorHome?: string | null }) {
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/teacher" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Teacher dashboard</Link>
        <span className="rounded-full bg-[rgba(99,102,241,0.18)] px-3 py-1 text-sm text-[var(--brand2)]">📤 Upload material</span>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Add curriculum material</h1>
      <p className="mb-6 mt-1 text-[var(--muted)]">
        Upload one or more .docx, .pdf, .pptx or .txt files — each gets split into cited chunks for you to review
        before students ever see it.
      </p>

      {/* Upload is one of the four teacher screens, not a dead end reached
          only by a back-link. */}
      <TeacherTabs seniorHome={seniorHome} />

      {children}
    </main>
  );
}
