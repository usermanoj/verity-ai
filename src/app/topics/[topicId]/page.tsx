import Link from "next/link";
import { notFound } from "next/navigation";
import AiTutorPanel from "@/components/tutor/AiTutorPanel";
import LessonSections from "@/components/topic/LessonSections";
import PracticeZone from "@/components/practice/PracticeZone";
import { contentRepo } from "@/lib/content-repo";

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

  const topic = await contentRepo.getTopic(topicId);
  if (!topic) notFound();

  const [chunks, bank] = await Promise.all([
    contentRepo.getCorpusForTopic(topicId),
    contentRepo.getPracticeBank(topicId),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/subjects" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Subjects</Link>
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          {topic.subject && (
            <span className="rounded-full bg-[rgba(34,211,238,0.15)] px-3 py-1 text-[var(--brand2)]">
              📚 {topic.subject}
            </span>
          )}
          {topic.grade && <span>{topic.grade}</span>}
        </div>
      </div>

      <h1 className="text-4xl font-bold tracking-tight">{topic.title}</h1>
      <p className="mt-2 max-w-2xl text-[var(--muted)]">
        Approved class material — the assistant answers only from this, and cites it every time.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-[rgba(99,102,241,0.16)] px-3 py-1.5 text-[var(--brand2)]">
          📘 {chunks.length} section{chunks.length === 1 ? "" : "s"}
        </span>
        {bank.length > 0 && (
          <span className="rounded-full bg-[rgba(52,211,153,0.16)] px-3 py-1.5 text-[#6ee7b7]">
            🎯 {bank.length} practice question{bank.length === 1 ? "" : "s"}
          </span>
        )}
        <span className="glass rounded-full px-3 py-1.5 text-[var(--muted)]">✓ Teacher-approved · cited</span>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="text-lg">📘</span>
            <h2 className="text-lg font-semibold">Learn</h2>
            <span className="ml-auto text-xs text-[var(--muted)]">hover a dotted word for meaning + 中文</span>
          </div>

          <LessonSections chunks={chunks} />

          {bank.length > 0 ? (
            <PracticeZone key={topicId} bank={bank} />
          ) : (
            <div className="glass rounded-3xl p-6 text-sm text-[var(--muted)]">
              Practice questions are being prepared from this material — your teacher approves them before they appear.
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <AiTutorPanel topicId={topicId} topicTitle={topic.title} />
        </div>
      </div>
    </main>
  );
}
