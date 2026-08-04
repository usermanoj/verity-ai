// The same wrong answer, given again.
//
// A student in this school answered "At the centre" four times to "where is the
// magnetic field strength concentrated?". The dashboard showed that as four
// rows in a list of wrong answers, indistinguishable from four different
// mistakes — and those are not the same thing at all.
//
//   four different mistakes  → they have not learned it
//   the same one four times  → they have learned something, and it is wrong
//
// The second needs a correction, not more practice, and it is the sharpest
// signal in the data. Nothing surfaced it.
//
// Pure, and separate from the query, because the two judgements here are about
// a child: what counts as "the same answer" when a nine-year-old types it
// twice, and how far apart two attempts must be to count as two decisions
// rather than one double-click.

export type WrongAttempt = {
  questionId: string | null;
  prompt: string | null;
  /** Exactly what they submitted — a letter, for a multiple choice. */
  answer: string;
  /**
   * The same choice in words, where the grader could resolve one.
   *
   * "Answered B" is half a sentence: B is a position in a list the teacher
   * cannot see. Null for a typed answer, which is already its own words, and
   * for an attempt whose question is gone.
   */
  chosenAnswer?: string | null;
  correctAnswer: string | null;
  at: string;
};

export type Misconception = {
  questionId: string;
  prompt: string | null;
  /** The most readable form of what they chose, for a teacher to read. */
  answer: string;
  /** What they actually submitted, kept whether or not it is what is shown. */
  submitted: string;
  correctAnswer: string | null;
  /** Separate occasions, not raw rows — see REPEAT_GAP_MS. */
  occasions: number;
  firstAt: string;
  lastAt: string;
};

/**
 * Two identical answers closer together than this are one decision.
 *
 * A double-tap on a slow connection, or a student pressing Check again to see
 * the feedback, must not read as conviction. A minute is generous: nobody
 * reconsiders a physics question and arrives back at the same wrong answer in
 * under sixty seconds.
 */
export const REPEAT_GAP_MS = 60_000;

/**
 * Occasions before it is worth a teacher's attention.
 *
 * Two. Once is a mistake; twice is a belief — the child had the question in
 * front of them a second time and did not change their mind. Waiting for three
 * would mean a misconception has to survive a whole extra round of practice
 * before anyone is told about it.
 */
export const MIN_OCCASIONS = 2;

/**
 * What a child typed, reduced to what they meant.
 *
 * Case and spacing only. Nothing cleverer: "1/2" and "0.5" are the same number
 * and NOT the same answer from a student learning to convert, and a normaliser
 * that merged them would erase the mistake being looked for.
 */
export function normalise(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Repeated wrong answers, worst first.
 *
 * Attempts on questions with no id are dropped: without one there is no way to
 * know whether two identical answers were to the same question, and "zone"
 * given to two different fill-in-the-blanks is not a misconception.
 */
export function findMisconceptions(
  wrong: WrongAttempt[],
  minOccasions = MIN_OCCASIONS,
): Misconception[] {
  const groups = new Map<string, WrongAttempt[]>();

  for (const w of wrong) {
    if (!w.questionId) continue;
    // JSON.stringify rather than a separator character: the first attempt at
    // this line wrote a literal NUL where a space was meant, which is how a
    // source file becomes binary to git. A pair encodes with no separator to
    // choose and no answer text that can collide with a key.
    // Grouped on what they submitted, not on the readable form: the raw value
    // is the thing that is actually identical between two attempts, and a
    // resolved option could be absent on one of them.
    const key = JSON.stringify([w.questionId, normalise(w.answer)]);
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }

  const out: Misconception[] = [];

  for (const attempts of groups.values()) {
    const sorted = [...attempts].sort((a, b) => a.at.localeCompare(b.at));

    // Collapse repeats that arrived too close together to be separate
    // decisions.
    let occasions = 0;
    let lastCounted = -Infinity;
    for (const a of sorted) {
      const t = new Date(a.at).getTime();
      if (Number.isNaN(t)) continue;
      if (t - lastCounted >= REPEAT_GAP_MS) {
        occasions++;
        lastCounted = t;
      }
    }
    if (occasions < minOccasions) continue;

    const last = sorted[sorted.length - 1];
    out.push({
      questionId: last.questionId!,
      prompt: last.prompt,
      // Words if we have them, the raw submission otherwise. A teacher should
      // never be shown "B" when "At the centre" was available.
      answer: last.chosenAnswer?.trim() || last.answer,
      submitted: last.answer,
      correctAnswer: last.correctAnswer,
      occasions,
      firstAt: sorted[0].at,
      lastAt: last.at,
    });
  }

  return out.sort((a, b) => b.occasions - a.occasions || b.lastAt.localeCompare(a.lastAt));
}

/**
 * The finding as a sentence.
 *
 * States what happened and stops. It deliberately does not diagnose — "they
 * think the field is strongest in the middle" may well be right, and it is the
 * teacher's inference to draw, not this file's. Naming the answer and its
 * repetition is the whole contribution; the person who knows the child
 * supplies the rest.
 */
export function describeMisconception(m: Misconception): string {
  const times = m.occasions === 2 ? "twice" : `${m.occasions} times`;
  const right = m.correctAnswer ? ` The answer is “${m.correctAnswer}”.` : "";
  return `Answered “${m.answer}” ${times} to the same question.${right}`;
}
