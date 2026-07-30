// Rolling question outcomes up into "what should I reteach on Monday".
//
// Pure, and separate from both the SQL and the components, because every rule
// here decides what a teacher is told about a class of children: how much
// evidence before we call a concept failed, which wrong answer counts as a
// shared misconception, and what order to put them in. Those are claims, and
// claims should be testable.

export type QuestionOutcome = {
  questionId: string;
  prompt: string;
  level: string | null;
  chunkId: string;
  heading: string;
  document: string;
  attempts: number;
  wrong: number;
  students: number;
  /** Wrong answer → how many students gave it. */
  wrongAnswers: Record<string, number>;
  /** The choices the student saw, for multiple choice. */
  options: string[];
};

export type Misconception = {
  /** What they picked, as the student saw it. */
  answer: string;
  count: number;
  /** Share of the wrong answers, not of all attempts. */
  share: number;
};

export type ConceptFailure = {
  chunkId: string;
  heading: string;
  document: string;
  attempts: number;
  wrong: number;
  students: number;
  failureRate: number;
  /** The single question that went worst, for a teacher to read. */
  worstQuestion: { prompt: string; level: string | null; wrong: number; attempts: number } | null;
  misconception: Misconception | null;
};

// A concept needs this many attempts before we will say a class failed it.
// Below it, one confused child looks like a curriculum problem.
export const MIN_ATTEMPTS = 5;

// And this share of wrong answers before one counts as shared rather than
// scattered. Two students out of nine picking the same distractor is chance;
// most of them picking it is a belief.
const MISCONCEPTION_SHARE = 0.5;
const MISCONCEPTION_MIN = 2;

/**
 * The wrong answer most of them gave, if there is one.
 *
 * Returns null when the wrong answers are scattered — which is the common and
 * boring case, and saying "no clear pattern" is more useful than promoting
 * whichever answer happened to come first.
 */
export function topMisconception(q: Pick<QuestionOutcome, "wrongAnswers" | "options">): Misconception | null {
  const entries = Object.entries(q.wrongAnswers).filter(([a, n]) => a.trim() !== "" && n > 0);
  if (entries.length === 0) return null;

  const total = entries.reduce((sum, [, n]) => sum + n, 0);
  const [answer, count] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  const share = count / total;

  if (count < MISCONCEPTION_MIN || share < MISCONCEPTION_SHARE) return null;

  return { answer: optionText(answer, q.options), count, share };
}

/**
 * Turns a stored answer into what the student actually saw.
 *
 * Multiple choice is graded and stored as "A"/"B"/"C", which tells a teacher
 * nothing. "steel" tells them the class believes steel isn't magnetic.
 */
export function optionText(answer: string, options: string[]): string {
  const letter = answer.trim().toUpperCase();
  if (letter.length === 1 && letter >= "A" && letter <= "Z") {
    const at = options[letter.charCodeAt(0) - 65];
    if (at) return at;
  }
  return answer;
}

/**
 * Groups question outcomes into concepts, worst first.
 *
 * Ranked by how many students got it wrong rather than by failure rate: a
 * question 100% of two students failed matters less than one 60% of twenty
 * failed, and a teacher's time goes to the second.
 */
export function conceptsToReteach(outcomes: QuestionOutcome[]): ConceptFailure[] {
  const byChunk = new Map<string, QuestionOutcome[]>();
  for (const o of outcomes) {
    const list = byChunk.get(o.chunkId);
    if (list) list.push(o);
    else byChunk.set(o.chunkId, [o]);
  }

  const concepts: ConceptFailure[] = [];
  for (const [chunkId, questions] of byChunk) {
    const attempts = questions.reduce((n, q) => n + q.attempts, 0);
    const wrong = questions.reduce((n, q) => n + q.wrong, 0);
    if (attempts < MIN_ATTEMPTS || wrong === 0) continue;

    // The worst question by count wrong, tie-broken by rate so a clear
    // failure beats a busier but healthier question.
    const worst = questions.reduce((best, q) =>
      q.wrong !== best.wrong ? (q.wrong > best.wrong ? q : best) : q.wrong / q.attempts > best.wrong / best.attempts ? q : best,
    );

    concepts.push({
      chunkId,
      heading: questions[0].heading,
      document: questions[0].document,
      attempts,
      wrong,
      // Distinct students cannot be summed across questions without
      // double-counting, so the largest single question is the honest floor.
      students: Math.max(...questions.map((q) => q.students)),
      failureRate: wrong / attempts,
      worstQuestion: { prompt: worst.prompt, level: worst.level, wrong: worst.wrong, attempts: worst.attempts },
      misconception: topMisconception(worst),
    });
  }

  return concepts.sort((a, b) => b.wrong - a.wrong || b.failureRate - a.failureRate || a.heading.localeCompare(b.heading));
}

export type AskedAbout = {
  topic: string;
  presses: number;
  students: number;
  maxInOneSitting: number;
  repeatedStudents: number;
};

// Pressing Explain three times in one sitting is a student telling you the
// lesson did not land — before any assessment says so.
export const REPEAT_THRESHOLD = 3;

// What the SQL coalesces a missing title to (0030). Conversations logged before
// 0026 began snapshotting topic_title, and whose document has since been
// replaced, have no title left to recover — the name is gone, not hidden.
//
// The string is duplicated between here and the migration, which is a real if
// small coupling. The alternative is emitting null from SQL and needing a
// migration to change a display rule; a named constant and this comment were
// judged the better trade.
export const UNTITLED_LESSON = "Untitled lesson";

function untitled(topic: string): boolean {
  const t = topic.trim();
  return t === "" || t === UNTITLED_LESSON;
}

/**
 * Lessons worth a second look, most-asked first.
 *
 * Keeps anything where somebody asked repeatedly even if the total is small:
 * one student stuck three times on a lesson nobody else touched is exactly
 * the signal that gets lost in a total.
 *
 * Drops lessons with no name, for the same reason as the evidence floor on
 * concepts: a row a teacher cannot act on is worse than no row. On the real
 * data the unnamed row carried the largest number on the page — 25 requests
 * against the named lesson's 10 — so it read as a mystery lesson a child was
 * badly stuck on, when it was really three old sittings whose deck has since
 * been replaced. Reported by untitledLesson() rather than silently swallowed.
 */
export function lessonsToRevisit(rows: AskedAbout[]): AskedAbout[] {
  return [...rows]
    .filter((r) => r.presses > 0 && !untitled(r.topic))
    .sort(
      (a, b) =>
        b.repeatedStudents - a.repeatedStudents ||
        b.maxInOneSitting - a.maxInOneSitting ||
        b.presses - a.presses ||
        a.topic.localeCompare(b.topic),
    );
}

/**
 * The rolled-up row for lessons whose name is gone, or null if there is none.
 *
 * Exists so the panel can account for what it dropped. A list that quietly
 * shrinks is the same failure as an accuracy figure computed over staff: the
 * number on screen is right and the teacher's reading of it is wrong.
 */
export function untitledLesson(rows: AskedAbout[]): AskedAbout | null {
  const hidden = rows.filter((r) => r.presses > 0 && untitled(r.topic));
  if (hidden.length === 0) return null;

  // Normally one row — the SQL groups by topic, so every untitled conversation
  // has already collapsed into a single row. Summed anyway rather than taking
  // the first, so a future grouping change cannot silently under-report.
  return {
    topic: UNTITLED_LESSON,
    presses: hidden.reduce((n, r) => n + r.presses, 0),
    students: Math.max(...hidden.map((r) => r.students)),
    maxInOneSitting: Math.max(...hidden.map((r) => r.maxInOneSitting)),
    repeatedStudents: Math.max(...hidden.map((r) => r.repeatedStudents)),
  };
}
