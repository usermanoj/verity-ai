"use client";

import {
  MIN_PER_TOPIC,
  rank,
  trend,
  type TopicScore,
  type Week,
} from "@/lib/student-breakdown";
import { describeEngagement, engagement, mergeReading, type ReadingRow } from "@/lib/reading";

// What this child is good at, what they are not, and whether it is moving.
//
// The panel this sits in could already show every wrong answer. What it could
// not do is add them up: a teacher reading twelve individual failures still has
// to work out for themselves that eight of them are moments. This does that
// arithmetic, which is the difference between "Aarav is struggling" and "Aarav
// needs moments retaught".
//
// Strengths are not decoration. A child who is told only what they get wrong
// learns that the subject is a list of their failures, and the one thing this
// screen can do about that is give their teacher something true to say.

export default function StrengthsPanel({
  topics,
  weekly,
  reading = [],
}: {
  topics: TopicScore[];
  weekly: Week[];
  reading?: ReadingRow[];
}) {
  const ranked = rank(topics);
  const movement = trend(weekly);
  const read = mergeReading(reading);
  const nothingYet = topics.length === 0 && read.length === 0;

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium uppercase tracking-widest text-[var(--muted)]">
        Strengths and weaknesses
      </h3>

      {nothingYet ? (
        <p className="text-sm text-[var(--muted)]">
          Nothing to break down yet — they haven&apos;t opened a lesson or answered anything.
        </p>
      ) : (
        <div className="space-y-3">
          <Movement movement={movement} />
          <Reading read={read} topics={topics} />

          <Group
            title="Strong"
            tone="good"
            topics={ranked.strengths}
            empty="Nothing at 80% or better yet."
          />
          <Group
            title="Needs reteaching"
            tone="warn"
            topics={ranked.weaknesses}
            empty="Nothing below half."
          />
          {ranked.mixed.length > 0 && <Group title="In between" tone="muted" topics={ranked.mixed} empty="" />}

          {ranked.unproven.length > 0 && (
            // Shown rather than hidden: a topic missing from this list would
            // read as one the child has not touched, when they have simply not
            // done enough of it to say anything honest.
            <p className="text-xs text-[var(--muted)]">
              Too few answers to judge ({MIN_PER_TOPIC} needed):{" "}
              {ranked.unproven.map((t) => `${t.title} (${t.attempts})`).join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Movement({ movement }: { movement: ReturnType<typeof trend> }) {
  const { direction, before, after, weeksCompared } = movement;

  if (direction === "too_few") {
    return (
      <p className="text-xs text-[var(--muted)]">
        {weeksCompared === 0
          ? "Not enough work yet to say whether they are improving."
          : "Only one week with enough answers in it — no comparison yet."}
      </p>
    );
  }

  const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
  const word =
    direction === "improving" ? "Improving" : direction === "slipping" ? "Slipping" : "Steady";
  const tone =
    direction === "improving" ? "var(--good)" : direction === "slipping" ? "var(--warn)" : "var(--text)";

  return (
    <div className="rounded-2xl border border-[var(--border)] p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium" style={{ color: tone }}>
          {word}
        </span>
        <span className="text-xs text-[var(--muted)] tabular-nums">
          {pct(before)} → {pct(after)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-[var(--muted)]">
        earlier weeks against later, over {weeksCompared} week{weeksCompared === 1 ? "" : "s"} with enough answers
      </p>
    </div>
  );
}

function Group({
  title,
  tone,
  topics,
  empty,
}: {
  title: string;
  tone: "good" | "warn" | "muted";
  topics: TopicScore[];
  empty: string;
}) {
  const color = tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : "var(--muted)";

  if (topics.length === 0 && !empty) return null;

  return (
    <div>
      <div className="mb-1 text-xs font-medium" style={{ color }}>
        {title}
      </div>
      {topics.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {topics.map((t) => (
            <li
              key={t.topicId}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-1.5"
            >
              <span className="min-w-0 truncate text-sm">{t.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
                {t.correct}/{t.attempts} · {Math.round((t.correct / t.attempts) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * What they read, beside what they answered.
 *
 * The pair is the finding. "Read the whole lesson and answered nothing" and
 * "answered everything without opening the lesson" are both worth a teacher's
 * attention, and neither is visible from either number alone.
 *
 * Sections reached — never how long they spent. See lib/reading.ts.
 */
function Reading({ read, topics }: { read: ReturnType<typeof mergeReading>; topics: TopicScore[] }) {
  if (read.length === 0) {
    return (
      <p className="text-xs text-[var(--muted)]">
        No reading recorded yet — this starts from the next lesson they open.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-1 text-xs font-medium text-[var(--muted)]">Read</div>
      <ul className="space-y-1">
        {read.map((r) => {
          const attempts = topics.find((t) => t.topicId === r.topicId)?.attempts ?? 0;
          const state = engagement(r, attempts);
          return (
            <li key={r.topicId} className="rounded-xl border border-[var(--border)] px-3 py-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm">
                  {topics.find((t) => t.topicId === r.topicId)?.title ?? "A lesson"}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
                  {r.reached}/{r.total} sections
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{describeEngagement(state, r)}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
