import Link from "next/link";
import { TeacherStats } from "@/components/analytics/TeacherAnalyticsView";
import TeacherTabs from "@/components/teacher/TeacherTabs";
import { getTeacherAnalytics } from "@/lib/analytics";
import MaterialList, { relativeTime, type MaterialRow } from "@/components/teacher/MaterialList";
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
  const [data, material] = await Promise.all([getTeacherAnalytics(), getMaterial()]);

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
      <p className="mb-6 mt-1 text-[var(--muted)]">
        What your students can see, and what is waiting on you.
      </p>

      <TeacherTabs />

      <div className="space-y-5">
        {data && <TeacherStats data={data} />}

        <Panel title="Your material" hint="Newest first — what you have uploaded, where it goes, and whether students can see it yet.">
          <MaterialList rows={material} />
        </Panel>
      </div>
    </main>
  );
}

// One SECURITY DEFINER call (migration 0022), for the same reason
// /teacher/ingest uses one: reading corpus_documents directly through the
// caller's session returned nothing here while the ingest page listed the
// same teacher's five approved documents on the same deploy.
//
// The previous version also swallowed the error that would have said why —
// `if (error) return []` renders an empty list and a cheerful "Nothing
// uploaded yet", which is indistinguishable from a teacher who has genuinely
// uploaded nothing. That is the third time today a discarded error has cost a
// round trip, so this one is logged.
type MaterialJson = {
  id: string;
  source_file: string;
  status: MaterialRow["status"];
  version: number | null;
  created_at: string;
  subject: string;
  grade: string;
  sections: string[];
};

async function getMaterial(): Promise<MaterialRow[]> {
  if (!hasSupabase()) return [];
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc("teacher_material_list", { p_limit: 30 });
    if (error) {
      console.error("[teacher] could not load material list:", error);
      return [];
    }

    // Stamped once here rather than in the component body: every row then
    // measures against the same instant, and the render stays pure (calling
    // Date.now() during render is exactly what the compiler forbids).
    const now = Date.now();

    return ((data as MaterialJson[] | null) ?? []).map((d) => ({
      id: d.id,
      // The same rule the student-facing page uses: strip the extension
      // rather than invent a title.
      title: d.source_file.replace(/\.[^.]+$/, ""),
      subject: d.subject,
      grade: d.grade,
      sections: d.sections ?? [],
      status: d.status,
      version: d.version ?? 1,
      age: relativeTime(d.created_at, now),
      uploadedAt: d.created_at,
    }));
  } catch (err) {
    console.error("[teacher] material list threw:", err);
    return [];
  }
}

