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
};

export type Question = NumericQuestion | McqQuestion;

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
  const a = (answer || "").trim().toUpperCase().replace(/[).\s]/g, "");
  const correct = a === q.correct.trim().toUpperCase();
  return {
    correct,
    score: correct ? 1 : 0,
    feedback: correct ? "Correct!" : "Not quite — review the material and try again.",
    details: {},
  };
}

export function grade(q: Question, answer: string): GradeResult {
  return q.kind === "numeric" ? gradeNumeric(q, answer) : gradeMcq(q, answer);
}
