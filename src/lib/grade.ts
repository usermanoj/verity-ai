// Deterministic grader — rule-based, NO LLM. Accuracy is guaranteed.
// Handles numeric physics answers (value + unit + optional direction) and MCQ.
// Probabilistic (LLM) grading is reserved for open short-answer elsewhere.

export type NumericQuestion = {
  kind: "numeric";
  expected: number;
  unit?: string;            // e.g. "Nm", "N"
  direction?: "clockwise" | "anticlockwise";
  tolerance?: number;       // absolute tolerance; default 1% of expected
};

export type McqQuestion = {
  kind: "mcq";
  correct: string;          // e.g. "C"
  // The choices themselves. Generated questions used to carry only `correct`,
  // so "Which of the following is a magnetic material?" reached students as a
  // blank text box with nothing to choose from — unanswerable, and marked
  // wrong whatever they typed. Optional because the hand-authored demo banks
  // spell their options out inside the prompt text.
  // readonly so a caller can pass an `as const` literal — the grader only
  // ever reads these.
  options?: readonly string[];
};

export type TrueFalseQuestion = {
  kind: "truefalse";
  correct: boolean;
  // Why the statement is true or false, in the source's own terms.
  because?: string;
};

export type FillBlankQuestion = {
  kind: "fill";
  // Every spelling that counts as right. ESL students should not lose a mark
  // to "magnetised" vs "magnetized", or to a stray capital.
  accept: readonly string[];
};

export type MatchingQuestion = {
  kind: "matching";
  pairs: readonly { left: string; right: string }[];
};

export type Question =
  | NumericQuestion
  | McqQuestion
  | TrueFalseQuestion
  | FillBlankQuestion
  | MatchingQuestion;

export type GradeResult = {
  correct: boolean;
  score: number;            // 0..1
  feedback: string;
  // What the right answer was, for a wrong attempt.
  //
  // Each grader used to fold this into its feedback sentence — or not at all,
  // so numeric and true/false said "not quite" and left the student with no
  // way to find out. This is practice, not an exam: a student who cannot see
  // the answer cannot learn from the attempt. Kept separate from `feedback`
  // so the UI can present it consistently instead of burying it in prose.
  correctAnswer?: string;
  // What the STUDENT chose, in words, for a wrong attempt.
  //
  // The stored answer is their raw submission, and for a multiple choice that
  // is a letter — "B" — while correctAnswer is the option's text. A teacher
  // reading "answered B, the answer is At the poles" is reading half a
  // sentence: B is a position in a list they cannot see.
  //
  // The raw answer stays exactly as submitted, because it is evidence about a
  // child and must not be rewritten. This is the readable form beside it, and
  // it is set only where the two differ — a typed answer is already its own
  // words and needs no translation.
  chosenAnswer?: string;
  details: {
    valueOk?: boolean;
    unitOk?: boolean;
    directionOk?: boolean;
    parsedValue?: number | null;
  };
};

// Parse the first number from a free-text answer, tolerant of "= 300 Nm" etc.
export function parseNumber(input: string): number | null {
  if (!input) return null;
  const cleaned = input.replace(/,/g, "");
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

function detectDirection(input: string): "clockwise" | "anticlockwise" | null {
  const s = input.toLowerCase();
  // check anticlockwise / counter-clockwise first (superset of "clockwise")
  if (/anti-?clockwise|counter-?clockwise|ccw/.test(s)) return "anticlockwise";
  if (/clockwise|cw/.test(s)) return "clockwise";
  return null;
}

function detectUnit(input: string, unit: string): boolean {
  // normalise: "Nm", "N m", "N.m", "newton metre(s)"
  const s = input.toLowerCase().replace(/\s|\.|·/g, "");
  const u = unit.toLowerCase().replace(/\s|\.|·/g, "");
  if (s.includes(u)) return true;
  if (u === "nm" && /newtonmet(er|re)s?/.test(s)) return true;
  if (u === "n" && /newtons?/.test(s)) return true;
  return false;
}

export function gradeNumeric(q: NumericQuestion, answer: string): GradeResult {
  const parsed = parseNumber(answer);
  const tol = q.tolerance ?? Math.max(Math.abs(q.expected) * 0.01, 1e-9);
  const valueOk = parsed !== null && Math.abs(parsed - q.expected) <= tol;
  const unitOk = q.unit ? detectUnit(answer, q.unit) : true;
  const directionOk = q.direction ? detectDirection(answer) === q.direction : true;

  const correct = !!valueOk && unitOk && directionOk;
  // Partial credit: value is the main thing; unit + direction are worth 0.15 each.
  let score = 0;
  if (valueOk) score += 0.7;
  if (unitOk) score += q.unit ? 0.15 : 0;
  if (directionOk) score += q.direction ? 0.15 : 0;
  if (!q.unit) score += 0.15;
  if (!q.direction) score += 0.15;
  score = Math.min(1, valueOk ? score : score * 0.0); // no value => 0 (avoid rewarding guesses)

  let feedback: string;
  if (correct) {
    feedback = "Correct — well done! Your value, unit and direction all match.";
  } else if (!valueOk) {
    feedback =
      "The number isn't right yet. Check your formula (Moment = Force × distance) and remember to convert distances to metres.";
  } else if (!unitOk) {
    feedback = `Right value, but check your unit — a moment is measured in ${q.unit}.`;
  } else {
    feedback = "Right value and unit, but check the turning direction (clockwise vs anticlockwise).";
  }

  return {
    correct,
    score,
    feedback,
    correctAnswer: correct ? undefined : [q.expected, q.unit, q.direction].filter(Boolean).join(" "),
    details: { valueOk: !!valueOk, unitOk, directionOk, parsedValue: parsed },
  };
}

export function gradeMcq(q: McqQuestion, answer: string): GradeResult {
  const given = (answer || "").trim();
  const expected = q.correct.trim();

  // Both sides resolve to the option they name before being compared. A
  // choice arrives as a letter ("B"), a position ("2"), or the option's own
  // text, depending on whether the student clicked or typed — comparing the
  // raw strings marked "2" and "Iron" wrong against a correct answer of "B".
  const chosen = optionText(q, given);
  const answerText = optionText(q, expected);
  const correct =
    chosen !== undefined && answerText !== undefined
      ? normaliseText(chosen) === normaliseText(answerText)
      : normaliseChoice(given) === normaliseChoice(expected);

  return {
    correct,
    score: correct ? 1 : 0,
    feedback: correct ? "Correct!" : "Not quite — review the material and try again.",
    correctAnswer: correct ? undefined : (answerText ?? expected),
    // `chosen` is already resolved above to compare against. Recording it costs
    // nothing and is the difference between "answered B" and "answered At the
    // centre" on a teacher's screen.
    chosenAnswer: correct ? undefined : chosen,
    details: {},
  };
}

// "B", "b)", "2" and the option's own text all name the same choice.
function optionText(q: McqQuestion, key: string): string | undefined {
  if (!q.options) return undefined;
  const k = normaliseChoice(key);
  const index = /^[A-Z]$/.test(k) ? k.charCodeAt(0) - 65 : Number(k) - 1;
  if (Number.isInteger(index) && index >= 0 && index < q.options.length) return q.options[index];
  return q.options.find((o) => normaliseText(o) === normaliseText(key));
}

function normaliseChoice(s: string): string {
  return s.trim().toUpperCase().replace(/[).\s]/g, "");
}

// ESL students should not lose a mark to punctuation, case, or a doubled
// space — the physics is what is being tested here, not typing.
function normaliseText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;:!?'"()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Collapses -ise/-yse spellings onto their -ize/-yze counterparts so the two
// variants of one word compare equal.
function toZ(s: string): string {
  return s.replace(/is(e|ed|es|ing|ation)/g, "iz$1").replace(/ys(e|ed|es|ing)/g, "yz$1");
}

export function gradeTrueFalse(q: TrueFalseQuestion, answer: string): GradeResult {
  const a = normaliseText(answer);
  const said = /^(t|true|yes|correct)$/.test(a) ? true : /^(f|false|no|incorrect)$/.test(a) ? false : null;
  const correct = said !== null && said === q.correct;
  return {
    correct,
    score: correct ? 1 : 0,
    feedback: correct
      ? `Correct — ${q.because ?? "that matches the material."}`
      : said === null
        ? "Answer True or False."
        : `Not quite. ${q.because ?? "Re-read this section."}`,
    correctAnswer: correct ? undefined : q.correct ? "True" : "False",
    details: {},
  };
}

export function gradeFill(q: FillBlankQuestion, answer: string): GradeResult {
  const given = normaliseText(answer);
  // British and American spellings of the same word are both right: the
  // syllabus is taught in one and the internet is written in the other, and
  // a student who knows the physics should not be marked down for which one
  // they met first. The -ise/-ize swap has to apply mid-word — "magnetised"
  // ends in "d", so anchoring it to a word boundary never fired.
  const correct = q.accept.some((a) => {
    const want = normaliseText(a);
    return given === want || toZ(given) === toZ(want);
  });
  return {
    correct,
    score: correct ? 1 : 0,
    feedback: correct ? "Correct!" : "Not quite — read the section again.",
    correctAnswer: correct ? undefined : q.accept[0],
    details: {},
  };
}

// The answer is the student's pairing, serialised as "left=right" per line, so
// grading stays deterministic and needs no model call.
export function gradeMatching(q: MatchingQuestion, answer: string): GradeResult {
  // Answers are keyed by ROW index, because a question may legitimately
  // repeat a term — "Electromagnet / Permanent magnet / Electromagnet /
  // Permanent magnet", one row per property. Keying by the term's text
  // collapsed those rows into one another, so four answers graded as two.
  //
  // A key that isn't a row number is read as the term itself, which keeps
  // answers recorded before the change gradeable.
  const byRow = new Array<string | undefined>(q.pairs.length);
  const byLeft = new Map<string, string>();
  // The same pairing untouched. Everything above is normalised for comparison
  // — lowercased, punctuation stripped — which turns "2.4 Nm" into "24 nm".
  // Fine for deciding whether two answers match, wrong for showing a teacher
  // what a child wrote, so the original is kept alongside.
  const rawByRow = new Array<string | undefined>(q.pairs.length);
  const rawByLeft = new Map<string, string>();

  for (const line of (answer || "").split("\n")) {
    const at = line.indexOf("=");
    if (at < 0) continue;
    const key = line.slice(0, at);
    const right = normaliseText(line.slice(at + 1));
    if (!right) continue;

    const raw = line.slice(at + 1).trim();
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0 && index < q.pairs.length) {
      byRow[index] = right;
      rawByRow[index] = raw;
    } else {
      byLeft.set(normaliseText(key), right);
      rawByLeft.set(normaliseText(key), raw);
    }
  }

  const rightCount = q.pairs.filter(
    (p, i) => (byRow[i] ?? byLeft.get(normaliseText(p.left))) === normaliseText(p.right),
  ).length;
  const correct = rightCount === q.pairs.length;
  return {
    correct,
    // Partial credit: getting three of four pairs is not the same as knowing
    // nothing, and an all-or-nothing score teaches nothing about what to fix.
    score: q.pairs.length === 0 ? 0 : rightCount / q.pairs.length,
    feedback: correct
      ? "All matched correctly!"
      : `${rightCount} of ${q.pairs.length} matched.`,
    correctAnswer: correct ? undefined : q.pairs.map((p) => `${p.left} → ${p.right}`).join("; "),
    // The same arrow form as correctAnswer, so the two can be read against
    // each other. Stored keyed by row index — "0=8 Nm" says nothing about
    // which term row 0 was — and a teacher should not have to reconstruct the
    // question to find out what the child paired.
    chosenAnswer: correct
      ? undefined
      : q.pairs
          .map((p, i) => {
            const given = rawByRow[i] ?? rawByLeft.get(normaliseText(p.left));
            return `${p.left} → ${given ?? "—"}`;
          })
          .join("; "),
    details: {},
  };
}

export function grade(q: Question, answer: string): GradeResult {
  switch (q.kind) {
    case "numeric":
      return gradeNumeric(q, answer);
    case "mcq":
      return gradeMcq(q, answer);
    case "truefalse":
      return gradeTrueFalse(q, answer);
    case "fill":
      return gradeFill(q, answer);
    case "matching":
      return gradeMatching(q, answer);
  }
}
