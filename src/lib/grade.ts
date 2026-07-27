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
  options?: string[];
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
  accept: string[];
};

export type MatchingQuestion = {
  kind: "matching";
  pairs: { left: string; right: string }[];
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
    feedback: correct
      ? "Correct!"
      : answerText
        ? `Not quite — the answer is ${answerText}.`
        : "Not quite — review the material and try again.",
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
    feedback: correct ? "Correct!" : `Not quite — the word is "${q.accept[0]}".`,
    details: {},
  };
}

// The answer is the student's pairing, serialised as "left=right" per line, so
// grading stays deterministic and needs no model call.
export function gradeMatching(q: MatchingQuestion, answer: string): GradeResult {
  const given = new Map<string, string>();
  for (const line of (answer || "").split("\n")) {
    const [left, right] = line.split("=");
    if (left && right) given.set(normaliseText(left), normaliseText(right));
  }

  const rightCount = q.pairs.filter((p) => given.get(normaliseText(p.left)) === normaliseText(p.right)).length;
  const correct = rightCount === q.pairs.length;
  return {
    correct,
    // Partial credit: getting three of four pairs is not the same as knowing
    // nothing, and an all-or-nothing score teaches nothing about what to fix.
    score: q.pairs.length === 0 ? 0 : rightCount / q.pairs.length,
    feedback: correct
      ? "All matched correctly!"
      : `${rightCount} of ${q.pairs.length} matched. Look again at the ones left over.`,
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
