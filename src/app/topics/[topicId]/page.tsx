import SessionBadge from "@/components/SessionBadge";
import Link from "next/link";
import { notFound } from "next/navigation";
import AiTutorPanel from "@/components/tutor/AiTutorPanel";
import LessonSections from "@/components/topic/LessonSections";
import LessonNav from "@/components/topic/LessonNav";
import HashTarget from "@/components/topic/HashTarget";
import PracticeZone from "@/components/practice/PracticeZone";
import { contentRepo } from "@/lib/content-repo";
import { sourceHash } from "@/lib/translate/memory";
import { requireSignedIn } from "@/lib/auth";
import { canSee, visibleDocuments } from "@/lib/access";
import { getLanguagePref } from "@/lib/student-language";

// Generic topic page for teacher-uploaded material. Every approved document
// is a topic (see PostgresContentRepository), and its id is a uuid, so this
// dynamic segment serves them all.
//
// The two hackathon demo topics keep their own hand-built pages at
// topics/moments and topics/distance-time — Next.js matches those static
// segments ahead of this one — because they carry bespoke interactive
// visuals (the seesaw, the distance-time graph) that uploaded material has
// no equivalent for.
export const dynamic = "force-dynamic";

export default async function UploadedTopicPage({ params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;

  // Approved material was readable by anyone holding this URL. Now: sign in,
  // and then only if this document reaches a class you are in.
  const user = await requireSignedIn(`/topics/${topicId}`);
  const visibility = await visibleDocuments(user);
  // notFound rather than a "forbidden" page, so the URL does not confirm that
  // a document with this id exists.
  if (!canSee(visibility, topicId)) notFound();

  const topic = await contentRepo.getTopic(topicId);
  if (!topic) notFound();

  // Their saved reading level, so the assistant is pitched correctly from the
  // first reply rather than from whenever they remember to set a dropdown.
  const pref = await getLanguagePref(user?.id);

  const [chunks, bank, media, tables, glossary, sectionTranslations] = await Promise.all([
    contentRepo.getCorpusForTopic(topicId),
    contentRepo.getPracticeBank(topicId),
    contentRepo.getMediaForTopic(topicId),
    contentRepo.getTablesForTopic(topicId),
    // This document's own vocabulary, so the hover glosses match the lesson
    // rather than the physics demo the curated list was written for.
    contentRepo.getGlossary(topicId),
    // Chinese for each section, written by the batch pass when the teacher
    // approved this document — and replaced by their correction if they made
    // one.
    contentRepo.getSectionTranslations(topicId),
  ]);

  // Keyed by source hash in the database, by chunk id for the client: the
  // lesson components are client-side and cannot hash, and this page is a
  // Server Component, so the join belongs here.
  const translationBySection: Record<string, string> = {};
  for (const c of chunks) {
    const zh = sectionTranslations[sourceHash(c.text)];
    if (zh) translationBySection[c.id] = zh;
  }

  // Provenance belongs once, at the top. It used to sit under every paragraph
  // as "<file> — Page/Section 7", which is filing metadata: it told a student
  // nothing and broke the reading rhythm of every section.
  const sourceFile = chunks[0]?.source.split(" — ")[0] ?? "";
  const headings = chunks.map((c, i) => ({ id: `section-${i + 1}`, title: c.heading?.trim() || `Section ${i + 1}` }));


  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/subjects" className="text-sm text-[var(--muted)] transition-colors hover:text-[var(--text)]">
          ← Subjects
        </Link>
        <div className="flex items-center gap-3 text-sm text-[var(--muted)]">
          {topic.subject && (
            <span className="rounded-full bg-[rgba(34,211,238,0.15)] px-3 py-1 text-[var(--brand2)]">
              📚 {topic.subject}
            </span>
          )}
          {topic.grade && <span>{topic.grade}</span>}
          {/* The lesson page is where a student actually spends the hour, and
              it was the one place showing neither who they are nor a way out.
              Signing in and then seeing no name reads as not having signed in
              — and on a shared classroom device, "whose account is this?" has
              to be answerable without navigating away from the work. */}
          <SessionBadge />
        </div>
      </div>

      {/* Hero. The demo topics open with a statement of what the lesson is
          for; uploaded ones opened with a filename and a wall of text. */}
      <section className="glass relative overflow-hidden rounded-3xl p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.28),transparent_65%)]" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.18),transparent_65%)]" />

        <div className="relative">
          <h1 className="bg-gradient-to-br from-white to-[rgba(148,163,255,0.85)] bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
            {topic.title}
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Everything below comes from your class material. The assistant answers only from it — and shows you where
            each answer came from.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
            <Stat icon="📘" label={`${chunks.length} section${chunks.length === 1 ? "" : "s"}`} tone="brand" />
            {bank.length > 0 && (
              <Stat icon="🎯" label={`${bank.length} question${bank.length === 1 ? "" : "s"}`} tone="green" />
            )}
            <Stat icon="✓" label="Teacher-approved" tone="muted" />
            {sourceFile && <Stat icon="📎" label={sourceFile} tone="muted" />}
          </div>

          {/* The Practice Zone sits after the material, which is the right
              reading order — but on a 29-section lesson that puts it several
              screens down, so a student who came back only to practise had to
              scroll past everything to find it. A plain anchor jumps there
              without duplicating the component or shipping any JS. */}
          {bank.length > 0 && (
            <a
              href="#practice"
              className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[var(--brand)] px-5 py-2.5 text-sm font-medium text-white transition hover:-translate-y-0.5"
            >
              🎯 Practise now
              <span className="opacity-75">· {bank.length} questions</span>
            </a>
          )}
        </div>
      </section>

      {headings.length > 1 && <LessonNav headings={headings} />}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-6">
          {/* A Map can't cross the server/client boundary, so it goes over as
              a plain object keyed by page number. */}
          <LessonSections
            chunks={chunks}
            mediaByPage={Object.fromEntries(media)}
            tablesByPage={Object.fromEntries(tables)}
            glossary={glossary}
            translationBySection={translationBySection}
          />

          {bank.length > 0 ? (
            <div id="practice" className="scroll-mt-24">
              {/* Re-applies the jump while images below are still loading —
                  without it the anchor lands, then the layout grows underneath
                  and leaves the student mid-lesson. */}
              <HashTarget id="practice" />
              <PracticeZone key={topicId} bank={bank} />
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
              🎯 Practice questions are being prepared from this material — your teacher approves them before they
              appear.
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <AiTutorPanel
            topicId={topicId}
            topicTitle={topic.title}
            savedLevel={pref.level}
            savedChinese={pref.chinese}
          />
        </div>
      </div>
    </main>
  );
}

function Stat({ icon, label, tone }: { icon: string; label: string; tone: "brand" | "green" | "muted" }) {
  const tones = {
    brand: "bg-[rgba(99,102,241,0.16)] text-[var(--brand2)]",
    green: "bg-[rgba(52,211,153,0.16)] text-[#6ee7b7]",
    muted: "border border-[var(--border)] text-[var(--muted)]",
  };
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 ${tones[tone]}`}>
      <span aria-hidden>{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}
