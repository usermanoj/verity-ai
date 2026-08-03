// What one child is good at, what they are not, and whether it is moving.
//
// The dashboards could already say a student was struggling; they could not say
// what at. "62% overall" sends a teacher to a pupil without telling them what to
// teach, and the wrong-answer list shows the individual failures without ever
// adding them up into a subject.
//
// Both halves are read from practice_attempts, which already carries
// document_id, question_level and created_at. Nothing new is captured about a
// child to produce this — which matters, because the alternative kind of
// analytics (how long they looked at a page) is surveillance of a minor and
// measures a left-open tab as diligence.
//
// Pure, and separate from the SQL, because every threshold below is a judgement
// about a person: how many answers before you may call something a weakness,
// and how much change counts as improvement. A teacher may reasonably disagree
// with any of them, and they should be arguable without reading a query.

export type TopicScore = {
  topicId: string;
  title: string;
  attempts: number;
  correct: number;
};

/**
 * Answers on ONE topic before its accuracy may be quoted.
 *
 * Lower than the ten the whole-student figure requires (MIN_FOR_RATE in
 * student-progress.ts), and deliberately so: a deck's practice bank is spread
 * across topics, so demanding ten per topic would mean never saying anything
 * about anything. Five is the point where a single lucky guess stops swinging
 * the answer by more than twenty points.
 *
 * Below it the topic is still SHOWN, marked as too few. Hiding it would let a
 * teacher believe a child has not touched a subject they have simply not
 * finished.
 */
export const MIN_PER_TOPIC = 5;

/** At or above this a topic is a strength. */
export const STRONG_AT = 0.8;

/** Below this it is a weakness. Between the two is neither, and says so. */
export const WEAK_BELOW = 0.5;

export type Standing = "strong" | "weak" | "mixed" | "too_few";

export function standing(t: TopicScore): Standing {
  if (t.attempts < MIN_PER_TOPIC) return "too_few";
  const rate = t.correct / t.attempts;
  if (rate >= STRONG_AT) return "strong";
  if (rate < WEAK_BELOW) return "weak";
  return "mixed";
}

export type Ranked = {
  strengths: TopicScore[];
  weaknesses: TopicScore[];
  mixed: TopicScore[];
  unproven: TopicScore[];
};

/**
 * Sorts a student's topics into what they can do and what they cannot.
 *
 * Weaknesses come back worst-first and strengths best-first, because the two
 * lists are read for opposite reasons: one to decide what to reteach, the other
 * to decide what to say to a child who thinks they are bad at the subject.
 *
 * Ties break on attempts, so of two topics at the same rate the better-evidenced
 * one leads.
 */
export function rank(topics: TopicScore[]): Ranked {
  const out: Ranked = { strengths: [], weaknesses: [], mixed: [], unproven: [] };

  for (const t of topics) {
    const where = standing(t);
    if (where === "strong") out.strengths.push(t);
    else if (where === "weak") out.weaknesses.push(t);
    else if (where === "mixed") out.mixed.push(t);
    else out.unproven.push(t);
  }

  const rate = (t: TopicScore) => t.correct / t.attempts;
  out.strengths.sort((a, b) => rate(b) - rate(a) || b.attempts - a.attempts);
  out.weaknesses.sort((a, b) => rate(a) - rate(b) || b.attempts - a.attempts);
  out.mixed.sort((a, b) => rate(a) - rate(b));
  out.unproven.sort((a, b) => b.attempts - a.attempts);
  return out;
}

/* ------------------------------------------------------------------ trend */

export type Week = {
  /** ISO date of the Monday, as Postgres date_trunc produces it. */
  week: string;
  attempts: number;
  correct: number;
};

export type Direction = "improving" | "steady" | "slipping" | "too_few";

/**
 * Weeks with enough work in them to compare at all.
 *
 * A week holding two answers is not a data point about a child's learning, and
 * including it lets one Friday afternoon decide whether a term looks like
 * progress.
 */
export const MIN_PER_WEEK = 5;

/** Weeks worth comparing before any direction is claimed. */
export const MIN_WEEKS = 2;

/**
 * How much the accuracy has to move to be called movement.
 *
 * Ten points. Below that it is the noise of which questions happened to come up,
 * and a dashboard that announces a four-point rise as improvement teaches a
 * teacher to ignore it.
 */
export const MEANINGFUL_SHIFT = 0.1;

export type Trend = {
  direction: Direction;
  /** Accuracy over the earlier half, or null when there is not enough. */
  before: number | null;
  /** Accuracy over the later half. */
  after: number | null;
  /** Weeks that counted towards the comparison. */
  weeksCompared: number;
};

/**
 * Whether a student is getting better.
 *
 * Compares the earlier half of their weeks against the later half rather than
 * fitting a line: a teacher's question is "is this child doing better than they
 * were", and a gradient over sparse weekly points answers a different, more
 * fragile question.
 *
 * Returns "too_few" rather than a flat "steady" when there is not enough work,
 * because those mean opposite things — one is a child who has plateaued and one
 * is a child nobody can say anything about yet.
 */
export function trend(weeks: Week[]): Trend {
  const usable = weeks
    .filter((w) => w.attempts >= MIN_PER_WEEK)
    .slice()
    .sort((a, b) => a.week.localeCompare(b.week));

  if (usable.length < MIN_WEEKS) {
    return { direction: "too_few", before: null, after: null, weeksCompared: usable.length };
  }

  // The odd week out goes to the later half, so the most recent work is never
  // the thing left over.
  const split = Math.floor(usable.length / 2);
  const earlier = usable.slice(0, split);
  const later = usable.slice(split);

  const rateOf = (ws: Week[]) => {
    const attempts = ws.reduce((n, w) => n + w.attempts, 0);
    const correct = ws.reduce((n, w) => n + w.correct, 0);
    return attempts === 0 ? null : correct / attempts;
  };

  const before = rateOf(earlier);
  const after = rateOf(later);
  if (before === null || after === null) {
    return { direction: "too_few", before, after, weeksCompared: usable.length };
  }

  const shift = after - before;
  const direction: Direction =
    shift >= MEANINGFUL_SHIFT ? "improving" : shift <= -MEANINGFUL_SHIFT ? "slipping" : "steady";

  return { direction, before, after, weeksCompared: usable.length };
}
