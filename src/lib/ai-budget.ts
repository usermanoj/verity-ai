// How much AI one person, and one school, may spend in a day.
//
// Pure and free of any database import, because these numbers decide whether a
// child mid-lesson is told to come back tomorrow. That is a policy about
// children's learning wearing the costume of an infrastructure limit, and it
// should be readable, testable, and changeable without a migration.
//
// The counting lives in Postgres (see 0032) because it has to survive cold
// starts and coordinate across regions. The judgement lives here.

export type AiKind = "tutor" | "translate";

/**
 * Calls per person per day, by kind.
 *
 * Set from what real use looks like rather than from what a bill can bear. A
 * student working hard through one lesson sends on the order of twenty tutor
 * messages; sixty is a generous day and still a ceiling. Someone who reaches it
 * is either extraordinary or automated, and either way a human should look.
 *
 * Staff get more because a teacher legitimately previews across many lessons,
 * and being locked out of your own material before period six is worse than
 * the tokens it saves.
 */
export const DAILY_PER_PERSON: Record<AiKind, { student: number; staff: number }> = {
  tutor: { student: 60, staff: 200 },
  translate: { student: 60, staff: 300 },
};

/**
 * Calls per day across every account.
 *
 * The figure that actually protects the balance. A per-person cap multiplies by
 * the number of people: thirty students each politely inside sixty is 1,800
 * calls, which no small balance survives. This is the backstop that does not
 * scale with the roll.
 *
 * Deliberately low enough to be hit during a real pilot. Being told "the school
 * has reached today's limit" is a bad afternoon; an exhausted balance mid-term
 * is a dead product, and the first is recoverable by raising a number.
 */
export const DAILY_PER_SCHOOL = 1200;

export type Verdict =
  | { allowed: true }
  | { allowed: false; scope: "person" | "school"; message: string };

/**
 * Whether this call may proceed, given what has already been spent today.
 *
 * Takes counts rather than fetching them, so the decision is testable and the
 * route stays the only thing that touches the database.
 */
export function checkBudget(
  kind: AiKind,
  role: string | null,
  userCalls: number,
  schoolCalls: number,
): Verdict {
  // The school ceiling is checked FIRST. When both are exceeded, "the school
  // has reached today's limit" is the true and more useful thing to say — a
  // student told they personally asked too much would go and find a teacher to
  // report a fault that is not theirs.
  if (schoolCalls > DAILY_PER_SCHOOL) {
    return {
      allowed: false,
      scope: "school",
      message:
        "The school has reached today's limit for the AI assistant. Everything else still works — your lessons, the reading and the practice questions — and the assistant is back tomorrow. Please tell your teacher.",
    };
  }

  const limits = DAILY_PER_PERSON[kind];
  const limit = role === "student" ? limits.student : limits.staff;

  if (userCalls > limit) {
    return {
      allowed: false,
      scope: "person",
      message:
        "You've asked the assistant a lot today, so it needs a rest until tomorrow. The lesson, the reading and the practice questions all still work — and asking this much is a good sign, not a problem.",
    };
  }

  return { allowed: true };
}

/**
 * True when the person is close enough to their limit to warn them.
 *
 * Being cut off without warning mid-lesson is the failure this avoids: a
 * student who has been told "about ten left today" can choose what to spend
 * them on, which is the difference between a limit and a punishment.
 */
export function nearingLimit(kind: AiKind, role: string | null, userCalls: number): number | null {
  const limits = DAILY_PER_PERSON[kind];
  const limit = role === "student" ? limits.student : limits.staff;
  const left = limit - userCalls;
  return left > 0 && left <= 10 ? left : null;
}
