import Link from "next/link";
import TeacherTabs from "@/components/teacher/TeacherTabs";
import LanguageReview, { type GlossaryRow, type TranslationRow } from "@/components/teacher/LanguageReview";
import StudentLanguage, { type StudentRow } from "@/components/teacher/StudentLanguage";
import { Panel } from "@/components/analytics/charts";
import { requireAtLeast } from "@/lib/auth";
import SessionBadge from "@/components/SessionBadge";
import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/supabase/config";

// Review and correct the Chinese this product generates.
//
// One document at a time, because that is the unit a teacher owns and the unit
// the vocabulary belongs to. Picking one is a query parameter rather than a
// route segment so the picker can stay on the page.
export const dynamic = "force-dynamic";

type Review = { owned: boolean; glossary: GlossaryRow[]; translations: TranslationRow[] };

export default async function TeacherLanguagePage({
  searchParams,
}: {
  searchParams: Promise<{ doc?: string }>;
}) {
  await requireAtLeast("teacher", "/teacher/language");
  const { doc } = await searchParams;

  const [documents, students] = await Promise.all([getDocuments(), getStudents()]);
  const selected = doc && documents.some((d) => d.id === doc) ? doc : documents[0]?.id;
  const review = selected ? await getReview(selected) : null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Home</Link>
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          <SessionBadge />
        </div>
      </div>

      <h1 className="text-3xl font-bold tracking-tight">Language</h1>
      <p className="mb-6 mt-1 text-[var(--muted)]">
        The vocabulary and translations your students see, and your corrections to them.
      </p>

      <TeacherTabs />

      {/* Reading levels first: it is per student, it applies to every lesson,
          and it is the one thing on this page a teacher knows the answer to
          without reading anything. Vocabulary and translations are per
          document and are reviewed rather than decided. */}
      <div className="mb-5">
        <Panel title="Student reading levels" hint="Set how hard the assistant's English is for each of your students.">
          <StudentLanguage students={students} />
        </Panel>
      </div>

      {documents.length === 0 ? (
        <Panel title="Nothing to review">
          <p className="text-sm text-[var(--muted)]">
            Upload material first — vocabulary is generated from the document&apos;s own text.{" "}
            <Link href="/teacher/ingest" className="text-[var(--brand2)] hover:underline">Add material →</Link>
          </p>
        </Panel>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            {documents.map((d) => (
              <Link
                key={d.id}
                href={`/teacher/language?doc=${d.id}`}
                aria-current={d.id === selected ? "page" : undefined}
                className={`rounded-xl border px-3 py-1.5 text-xs transition ${
                  d.id === selected
                    ? "border-[var(--brand)] bg-[rgba(99,102,241,0.18)] text-[var(--text)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {d.title}
              </Link>
            ))}
          </div>

          <Panel title="Vocabulary & translations">
            {review && selected ? (
              <LanguageReview
                key={selected}
                documentId={selected}
                glossary={review.glossary}
                translations={review.translations}
              />
            ) : (
              <p className="text-sm text-[var(--muted)]">Couldn&apos;t load this document — please refresh.</p>
            )}
          </Panel>
        </>
      )}
    </main>
  );
}

async function getStudents(): Promise<StudentRow[]> {
  if (!hasSupabase()) return [];
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc("teacher_student_language");
    if (error) {
      console.error("[teacher/language] could not list students:", error);
      return [];
    }
    return (data as unknown as StudentRow[] | null) ?? [];
  } catch {
    return [];
  }
}

async function getDocuments(): Promise<{ id: string; title: string }[]> {
  if (!hasSupabase()) return [];
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc("teacher_material_list", { p_limit: 30 });
    if (error) {
      console.error("[teacher/language] could not list documents:", error);
      return [];
    }
    return ((data as { id: string; source_file: string }[] | null) ?? []).map((d) => ({
      id: d.id,
      title: d.source_file.replace(/\.[^.]+$/, ""),
    }));
  } catch {
    return [];
  }
}

async function getReview(documentId: string): Promise<Review | null> {
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc("teacher_language_review", { p_document_id: documentId });
    if (error) {
      console.error("[teacher/language] review lookup failed:", error);
      return null;
    }
    const review = data as unknown as Review | null;
    // `owned` is the function's own answer to "is this yours". A document the
    // caller does not own comes back empty, so rendering it would show an
    // empty editor rather than leak anything — but saying so is clearer.
    if (!review?.owned) return null;
    return review;
  } catch {
    return null;
  }
}
