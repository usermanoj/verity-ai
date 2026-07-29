import Link from "next/link";
import TeacherAnalyticsView from "@/components/analytics/TeacherAnalyticsView";
import { getTeacherAnalytics, getTeacherLearning } from "@/lib/analytics";
import ClassCodes, { type ClassCode } from "@/components/classes/ClassCodes";
import MaterialList, { relativeTime, type MaterialRow } from "@/components/teacher/MaterialList";
import JoinQr from "@/components/classes/JoinQr";
import { headers } from "next/headers";
import { Panel } from "@/components/analytics/charts";
import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/supabase/config";
import { requireRole } from "@/lib/auth";
import SessionBadge from "@/components/SessionBadge";

// Auth-gated: never prerender. The auth helpers read cookies at request
// time, but bail out early when Supabase env vars are absent — so a build
// without them (preview branches, where those vars are deliberately not set)
// would otherwise prerender this as a STATIC, auth-skipped snapshot.
export const dynamic = "force-dynamic";

export default async function TeacherPage() {
  await requireRole("teacher", "/teacher");
  const [data, learning, codes, material] = await Promise.all([
    getTeacherAnalytics(),
    getTeacherLearning(),
    getClassCodes(),
    getMaterial(),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Home</Link>
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          <Link href="/teacher/ingest" className="glass rounded-full px-3 py-1 hover:text-[var(--text)]">📤 Upload material</Link>
          <span className="rounded-full bg-[rgba(99,102,241,0.18)] px-3 py-1 text-[var(--brand2)]">👩‍🏫 Teacher</span>
        <SessionBadge />
        </div>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Your teaching material</h1>
      <p className="mt-1 text-[var(--muted)]">
        What your students can see, what is waiting on you, and where the gaps are.
      </p>

      <div className="mt-8 space-y-5">
        <Panel title="Your material" hint="Newest first — what you have uploaded, where it goes, and whether students can see it yet.">
          <MaterialList rows={material} />
        </Panel>

        <Panel title="Class codes" hint="Students sign in with their school account, then enter a code once to join a section.">
          <ClassCodes initial={codes} qrFor={await joinQrs(codes)} />
        </Panel>

        {data ? (
          <TeacherAnalyticsView data={data} learning={learning} />
        ) : (
          <p className="text-sm text-[var(--muted)]">Couldn&apos;t load your figures just now — please refresh.</p>
        )}
      </div>
    </main>
  );
}

// Read under the caller's RLS, not the service role: a teacher's dashboard
// should show a teacher's documents, and the policy already says which those
// are. Ordered newest-first in SQL rather than in JS so the limit takes the
// most recent rows and not an arbitrary thirty.
type DocumentRow = {
  id: string;
  source_file: string;
  status: MaterialRow["status"];
  version: number | null;
  created_at: string;
  corpus_document_sections?: {
    classes?: { section_name?: string; courses?: { subject?: string; grade?: string } | null } | null;
  }[];
};

async function getMaterial(): Promise<MaterialRow[]> {
  if (!hasSupabase()) return [];
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("corpus_documents")
      .select(
        "id, source_file, status, version, created_at, corpus_document_sections(classes(section_name, courses(subject, grade)))",
      )
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error || !data) return [];

    // Stamped once here rather than in the component body: every row then
    // measures against the same instant, and the render stays pure (calling
    // Date.now() during render is exactly what the compiler forbids).
    const now = Date.now();

    // The generated types don't model this embed, so it is narrowed by hand —
    // the same shape lib/content-repo.ts asserts for the identical join.
    const rows = data as unknown as DocumentRow[];

    return rows.map((d) => {
      // A document can apply to several of the teacher's own sections (7A and
      // 7B in one upload), so subject/grade come from the first and the
      // section names are listed.
      const links = d.corpus_document_sections ?? [];
      const course = links[0]?.classes?.courses;
      return {
        id: d.id,
        // The same rule the student-facing page uses: strip the extension
        // rather than invent a title.
        title: d.source_file.replace(/\.[^.]+$/, ""),
        subject: course?.subject ?? "",
        grade: course?.grade ?? "",
        sections: links.map((l) => l.classes?.section_name).filter((n): n is string => Boolean(n)),
        status: d.status,
        version: d.version ?? 1,
        age: relativeTime(d.created_at, now),
      };
    });
  } catch {
    return [];
  }
}

async function getClassCodes(): Promise<ClassCode[]> {
  if (!hasSupabase()) return [];
  try {
    const supabase = await supabaseServer();
    const { data } = await supabase.rpc("teacher_class_codes");
    return (data as ClassCode[] | null) ?? [];
  } catch {
    return [];
  }
}

// A QR has to carry an absolute URL, so the origin comes from the request
// rather than a hardcoded domain — the same code then works on localhost,
// a preview deployment and production without configuration.
async function joinQrs(codes: ClassCode[]): Promise<Record<string, React.ReactNode>> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return {};
  const protocol = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";

  const entries = codes
    .filter((c) => c.code)
    .map((c) => [
      c.classId,
      <JoinQr key={c.classId} url={`${protocol}://${host}/join?code=${encodeURIComponent(c.code!)}`} />,
    ] as const);

  return Object.fromEntries(entries);
}
