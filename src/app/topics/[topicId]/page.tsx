import Link from "next/link";
import { notFound } from "next/navigation";
import AiTutorPanel from "@/components/tutor/AiTutorPanel";
import ReadingText from "@/components/reading/ReadingText";
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

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-6">
          <section className="glass rounded-3xl p-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">📘</span>
              <h2 className="text-lg font-semibold">Learn</h2>
              <span className="ml-auto text-xs text-[var(--muted)]">hover a dotted word for meaning + 中文</span>
            </div>
            <div className="space-y-4">
              {chunks.map((c) => (
                <div key={c.id}>
                  {c.heading && <h3 className="mb-1 text-sm font-semibold text-[var(--brand2)]">{c.heading}</h3>}
                  {/* A title-only slide makes heading and text identical —
                      show the body only when it adds something. */}
                  {c.text.trim() !== c.heading.trim() && <ReadingText text={c.text} />}
                  <div className="mt-1 text-xs text-[var(--muted)]">📖 {c.source}</div>
                </div>
              ))}
            </div>
          </section>

          {bank.length > 0 ? (
            <PracticeZone key={topicId} bank={bank} />
          ) : (
            <div className="glass rounded-3xl p-6 text-sm text-[var(--muted)]">
              No practice questions yet — your teacher can generate and approve them from this material.
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
