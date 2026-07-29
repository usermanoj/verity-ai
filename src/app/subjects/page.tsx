import Link from "next/link";
import { contentRepo } from "@/lib/content-repo";
import { requireSignedIn } from "@/lib/auth";
import { canSee, visibleDocuments } from "@/lib/access";
import JoinClass from "@/components/classes/JoinClass";
import SessionBadge from "@/components/SessionBadge";
import { TOPICS as DEMO_TOPICS } from "@/data/corpus";

// Reads whatever teachers have actually approved, so it can't be prerendered.
export const dynamic = "force-dynamic";

const SUBJECTS = [
  { id: "physics", name: "Physics", icon: "🧲", color: "#22d3ee", topics: 2, ready: true, blurb: "Moments of a Force · Distance–Time Graphs" },
  { id: "math", name: "Mathematics", icon: "📐", color: "#6366f1", topics: 0, ready: false, blurb: "Algebra · Geometry · Data" },
  { id: "science", name: "Science", icon: "🔬", color: "#34d399", topics: 0, ready: false, blurb: "Biology · Chemistry · Energy" },
  { id: "english", name: "English", icon: "📖", color: "#f472b6", topics: 0, ready: false, blurb: "Reading · Grammar · Essays" },
];

// When the teacher added a lesson. Relative, because "3 days ago" is what a
// student can act on; the exact date is in the title attribute for anyone who
// wants it.
// Stamped in here rather than in the component body: every card then measures
// against the same instant, and the render stays pure — calling Date.now()
// during render is exactly what the compiler forbids.
async function addedLabels(topics: { id: string; addedAt?: string }[]): Promise<Record<string, string>> {
  const now = Date.now();
  return Object.fromEntries(topics.map((t) => [t.id, addedAgo(t.addedAt, now)]));
}

function addedAgo(iso: string | undefined, now: number): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const days = Math.floor((now - then) / 86_400_000);
  if (days <= 0) return "added today";
  if (days === 1) return "added yesterday";
  if (days < 7) return `added ${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? "added last week" : `added ${weeks} weeks ago`;
}

export default async function Subjects() {
  // Signed in, and then scoped. This page listed every approved document in
  // the database to anyone who loaded the URL.
  const user = await requireSignedIn("/subjects");
  const visibility = await visibleDocuments(user);

  const allTopics = await contentRepo.getTopics();
  // The two seeded demo topics are filtered out — they have their own
  // hand-built pages and are surfaced in the tasks table below.
  const uploaded = Object.values(allTopics)
    .filter((t) => !(t.id in DEMO_TOPICS) && canSee(visibility, t.id))
    // Newest first: what a teacher added most recently is what a student has
    // most likely been told to read.
    .sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));

  const added = await addedLabels(uploaded);

  // A student in no classes can see nothing, so the page has to offer the way
  // in rather than simply being empty. Staff are unrestricted viewers and
  // never need a code.
  const needsToJoin = visibility !== "all" && visibility.size === 0;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">← Home</Link>
        <SessionBadge />
      </div>

      {/* Staff see every approved document in the school, which is correct
          and does not look correct: without saying so, a teacher checking the
          student view reasonably concludes the material is not protected. */}
      {visibility === "all" && (
        <div className="mb-6 rounded-2xl border border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.08)] px-4 py-3 text-sm">
          You are signed in as staff, so this page shows <strong>all</strong> approved material in the school. A
          student sees only the classes they have joined with a code.
        </div>
      )}

      <h1 className="text-3xl font-bold tracking-tight">Good afternoon 👋</h1>
      <p className="mt-1 text-[var(--muted)]">Pick a subject to continue learning. Your AI learning assistant is ready.</p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SUBJECTS.map((s) => {
          const card = (
            <div
              className={`glass group h-full rounded-3xl p-5 transition ${s.ready ? "cursor-pointer hover:-translate-y-1 hover:border-[var(--brand)]" : "opacity-60"}`}
            >
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl text-2xl" style={{ background: `${s.color}22` }}>{s.icon}</div>
              <div className="font-semibold">{s.name}</div>
              <div className="mt-0.5 text-xs text-[var(--muted)]">{s.blurb}</div>
              <div className="mt-3 text-xs" style={{ color: s.ready ? s.color : "var(--muted)" }}>
                {s.ready ? `${s.topics} topic${s.topics === 1 ? "" : "s"} · open →` : "Coming soon"}
              </div>
            </div>
          );
          return s.ready ? (
            <Link key={s.id} href="/topics/moments">{card}</Link>
          ) : (
            <div key={s.id}>{card}</div>
          );
        })}
      </section>

      {needsToJoin && (
        <section className="mt-10">
          <JoinClass />
        </section>
      )}

      {uploaded.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-widest text-[var(--muted)]">
            Your class material
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {uploaded.map((t) => (
              <Link key={t.id} href={`/topics/${t.id}`}>
                <div className="glass h-full rounded-3xl p-5 transition hover:-translate-y-1 hover:border-[var(--brand)]">
                  <div className="mb-3 text-2xl">📘</div>
                  <div className="font-semibold">{t.title}</div>
                  <div className="mt-0.5 text-xs text-[var(--muted)]">
                    {[t.subject, t.grade].filter(Boolean).join(" · ") || "Approved material"}
                  </div>
                  {added[t.id] && (
                    <div className="mt-1 text-xs text-[var(--muted)] opacity-80" title={t.addedAt}>
                      {added[t.id]}
                    </div>
                  )}
                  <div className="mt-3 text-xs text-[var(--brand2)]">open →</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* "This week's tasks" used to live here: a hardcoded two-row table
          claiming Moments of a Force was "In progress" and due "This week".
          None of it was true for any student — there is no assignments model,
          so there was no due date to show and no progress to report. A
          dashboard that invents a deadline is worse than one that omits it,
          because a student may believe it.

          What IS real is above: the material their teacher has given them,
          and when. Due dates need teachers to be able to set them, which is
          a feature, not a column. */}
    </main>
  );
}
