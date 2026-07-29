// Turning a student's raw counts into something a teacher can act on.
//
// Deliberately pure and separate from both the SQL and the components. Every
// judgement here — is this child struggling, is this sample big enough to
// quote a percentage, who should I speak to first — is a claim about a real
// child, and claims about children should be testable rather than buried in a
// query or a template.

export type StudentProgress = {
  id: string;
  name: string;
  eslLevel: "advanced" | "intermediate" | "beginner";
  eslChinese: boolean;
  sections: string[];
  attempts: number;
  correct: number;
  lastAttemptAt: string | null;
  /** Last ten outcomes, oldest first. */
  recent: boolean[];
  tutorMessages: number;
  lastTutorAt: string | null;
  intents: Record<string, number>;
};

export type Flag = "not_started" | "struggling" | "inactive" | "answers_only";

// Below this, a percentage says more than it knows. Ten answers is the point
// where one lucky guess stops moving the figure by ten points.
export const MIN_FOR_RATE = 10;

const STRUGGLING_BELOW = 0.5;
const INACTIVE_DAYS = 7;

/**
 * Accuracy, or null when there is not enough work to quote one.
 *
 * Returning null rather than a number is the whole point: "33%" from three
 * answers looks like a finding and is noise, and a teacher acting on it is
 * acting on nothing.
 */
export function accuracy(s: Pick<StudentProgress, "attempts" | "correct">): number | null {
  if (s.attempts < MIN_FOR_RATE) return null;
  return s.correct / s.attempts;
}

export function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now - then) / 86_400_000);
}

/**
 * What is worth a teacher's attention about this student.
 *
 * "not_started" and "struggling" are deliberately different flags for what
 * both look like zero progress. A child who has not begun needs prompting; a
 * child who is trying and failing needs teaching. Collapsing them into one
 * number is how a dashboard sends a teacher to the wrong pupil.
 */
export function flagsFor(s: StudentProgress, now: number): Flag[] {
  const flags: Flag[] = [];

  if (s.attempts === 0 && s.tutorMessages === 0) {
    flags.push("not_started");
    // Nothing else is knowable about a student who has done nothing, and
    // stacking further flags on them just crowds the list.
    return flags;
  }

  const rate = accuracy(s);
  if (rate !== null && rate < STRUGGLING_BELOW) flags.push("struggling");

  const since = daysSince(s.lastAttemptAt ?? s.lastTutorAt, now);
  if (since !== null && since >= INACTIVE_DAYS) flags.push("inactive");

  // Leaning on the assistant for answers while never being questioned by it.
  // Explain and Give Example hand things over; Ask Me Questions and Check My
  // Answer require the student to produce something. A pupil who only ever
  // takes is coasting, and it is invisible in any accuracy figure.
  const taking = (s.intents.explain ?? 0) + (s.intents.example ?? 0);
  const giving = (s.intents.askme ?? 0) + (s.intents.check ?? 0);
  if (taking >= 5 && giving === 0) flags.push("answers_only");

  return flags;
}

const FLAG_RANK: Record<Flag, number> = {
  struggling: 0,
  not_started: 1,
  answers_only: 2,
  inactive: 3,
};

export const FLAG_LABEL: Record<Flag, string> = {
  struggling: "Struggling",
  not_started: "Not started",
  answers_only: "Answers only",
  inactive: "Inactive",
};

/**
 * Students ordered by who needs the teacher most.
 *
 * Sorted by the most serious flag each carries, then by name so the order is
 * stable between visits — a list that reshuffles for no reason cannot be
 * scanned, and a teacher reads this the same way every morning.
 */
export function byAttention(students: StudentProgress[], now: number): StudentProgress[] {
  return [...students].sort((a, b) => {
    const rank = (s: StudentProgress) =>
      flagsFor(s, now).reduce((best, f) => Math.min(best, FLAG_RANK[f]), Number.MAX_SAFE_INTEGER);
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
}

export type ClassSummary = {
  students: number;
  activeThisWeek: number;
  notStarted: number;
  /** Median of the students who have enough work to have one. Null if none do. */
  medianAccuracy: number | null;
  needAttention: number;
};

/**
 * The class in one line.
 *
 * Median rather than mean: one child who answered forty questions badly
 * should not describe the class, and a mean lets them.
 */
export function summarise(students: StudentProgress[], now: number): ClassSummary {
  const rates = students.map(accuracy).filter((r): r is number => r !== null).sort((a, b) => a - b);
  const mid = Math.floor(rates.length / 2);

  return {
    students: students.length,
    activeThisWeek: students.filter((s) => {
      const d = daysSince(s.lastAttemptAt ?? s.lastTutorAt, now);
      return d !== null && d < 7;
    }).length,
    notStarted: students.filter((s) => flagsFor(s, now).includes("not_started")).length,
    medianAccuracy:
      rates.length === 0 ? null : rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2,
    needAttention: students.filter((s) => flagsFor(s, now).length > 0).length,
  };
}
