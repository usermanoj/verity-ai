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
    // Whether the unit counted towards the mark. False when the question never
    // asked for one and the student did not offer one — there is nothing to
    // tick or cross, and a green "unit" against an answer of "5" would be
    // claiming the student got something right that they never wrote.
    unitGraded?: boolean;
    directionOk?: boolean;
    // Whether direction counted towards the mark at all. A question carrying a
    // direction its prompt never asks about does not get a tick or a cross for
    // it — a green "direction ✓" on a question that never mentioned direction
    // is as confusing as the red one it replaces.
    directionGraded?: boolean;
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

// Does the QUESTION ask which way it turns?
//
// Six approved questions carry direction: "clockwise" while asking only "What
// is the turning effect when the force is 4 N and the distance is 2 m?" — a
// force and a distance, with no geometry that could fix a direction. A student
// who answered "8 Nm", which is the whole of the right answer, was marked
// wrong and shown a red "direction" chip for something the question never
// mentioned.
//
// The test is the WORD "direction", which measurement says is exactly right
// here. Across the school's twenty approved numeric questions not one prompt
// contains it — including all six that demand one — while the hand-authored
// bank asks "State value, unit and direction (clockwise)" and means it.
//
// Matching on a mention of "clockwise" instead would be wrong twice over: it
// would miss "State value, unit and direction", and it would fire on "A
// balanced body has a clockwise moment of 12 N m. What is the anticlockwise
// moment about the pivot?", which names both directions while asking for
// neither and would fail a student for omitting what the question told them.
//
// The alternation is kept for a question that offers the choice without ever
// using the noun.
const ASKS_DIRECTION = /\bdirection\b|clockwise\s+or\s+anti-?clockwise/i;

// Stripped before a unit is read, so "8 Nm clockwise" is still 8 Nm.
const DIRECTION_WORDS = /(anti-?clockwise|counter-?clockwise|clockwise|ccw|cw)/g;

// Does the QUESTION ask for a unit?
//
// The same measurement as ASKS_DIRECTION, and the same answer: not one of the
// twenty approved numeric prompts contains the word, including the seventeen
// that demand a unit, while the hand-authored bank says "(Value + unit.)" and
// "Give value + unit" and means it.
const ASKS_UNIT = /\bunits?\b/i;

/**
 * Did the student put a unit on their answer at all?
 *
 * Anything alphabetic left once the number, the direction words and the
 * punctuation are gone. "5" claims nothing; "5 cm" claims centimetres and can
 * therefore be wrong. Words that are plainly prose rather than a unit —
 * "the answer is 5" — would read as a claim, so they are dropped first; that
 * list is deliberately tiny, because guessing wrongly here marks a bare number
 * wrong, which is the whole thing being fixed.
 */
const ANSWER_PROSE = /\b(the|answer|is|are|it|equals?|about|approx(imately)?|around|roughly|so|and|of)\b/g;

function claimsUnit(answer: string): boolean {
  const rest = answer
    .toLowerCase()
    .replace(DIRECTION_WORDS, " ")
    .replace(ANSWER_PROSE, " ")
    .replace(/-?\d+(\.\d+)?/g, " ")
    .replace(/[^a-z]/g, "");
  return rest.length > 0;
}

function detectUnit(input: string, unit: string): boolean {
  const u = unit.toLowerCase().trim();
  if (!u) return true;

  const s = input.toLowerCase().replace(/[.,()·]/g, " ").replace(DIRECTION_WORDS, " ");

  // A unit has to be the WHOLE unit, not a piece of a bigger one.
  //
  // This was `s.includes(u)` on a space-stripped string, which made "50 cm"
  // satisfy a question wanting metres, "50 mm" likewise, and "600 Nm" satisfy
  // one wanting newtons. Marking a wrong unit right is the mirror image of the
  // direction bug and quietly flatters a student's analytics.
  //
  // Whitespace inside the unit is optional in BOTH directions — "Nm", "N m"
  // and "N.m" are one unit written three ways, and which of them the mark
  // scheme happens to use must not decide whether a student is right. So the
  // unit is compacted and its characters rejoined with optional space.
  //
  // The boundaries exclude letters and "/" so that a prefix ("c" in "cm") or a
  // denominator ("/s" in "m/s") stops the match. Written without lookbehind:
  // school iPads run older Safari.
  const pattern = u
    .replace(/\s+/g, "")
    .split("")
    .map((c) => c.replace(/[.*+?^${}()|[\]\\/]/, "\\$&"))
    .join("\\s*");
  if (new RegExp(`(^|[^a-z/])${pattern}($|[^a-z/])`).test(s)) return true;

  // Written out in words, which is right and which an ESL student may prefer.
  if (/^n\s*m$/.test(u)) return /newton\s*met(er|re)s?/.test(s);
  if (u === "n") return /newtons?/.test(s);
  return false;
}

export function gradeNumeric(q: NumericQuestion, answer: string, prompt?: string): GradeResult {
  const parsed = parseNumber(answer);
  // A tolerance of 0 is the generator filling the field in, not a teacher
  // asking for exact float equality — three approved questions carry it. Left
  // as written it demands that a computed answer land on the same double, so
  // an expected value of 0.30000000000000004 rejects "0.3". Non-positive means
  // unset, and the documented 1% applies.
  const tol = q.tolerance && q.tolerance > 0 ? q.tolerance : Math.max(Math.abs(q.expected) * 0.01, 1e-9);
  const valueOk = parsed !== null && Math.abs(parsed - q.expected) <= tol;

  // A unit is only DEMANDED when the question asked for one — but a unit the
  // student volunteers is always marked.
  //
  // Seventeen approved questions carry a unit their prompt never mentions.
  // "How far did the person walk in the first part of the journey?" wants
  // "5 m" and rejects "5", which is the same defect as the direction one: the
  // software inventing a requirement the question did not state. The
  // hand-authored bank, which does want units, says so — "(Value + unit.)",
  // "Give value + unit" — and keeps its old behaviour exactly.
  //
  // Not graded and not-graded-at-all are different here, and that difference
  // matters more than it did for direction. A bare "5" claims nothing and is
  // the whole answer to a question that asked for a distance. "5 cm" claims
  // centimetres and is wrong, whether or not the question asked — a number
  // with the wrong unit on it is not a right answer that happens to be untidy.
  const unitAsked = q.unit ? prompt === undefined || ASKS_UNIT.test(prompt) : false;
  const unitOk = !q.unit || (!unitAsked && !claimsUnit(answer)) || detectUnit(answer, q.unit);
  const gradeUnit = Boolean(q.unit) && (unitAsked || claimsUnit(answer));

  // A direction is only marked when the question asked for one.
  //
  // Nothing may be required of a student that the question did not request. A
  // mark wrongly withheld tells their teacher to reteach something they
  // already knew, which is the harm this whole audit is about.
  //
  // A caller that supplies no prompt keeps the old strict behaviour: the hand
  // authored demo banks do ask for a direction, and silently loosening the
  // grade for a caller that has not opted in would be a second surprise of the
  // same kind. The one real caller passes the prompt.
  const gradeDirection = Boolean(q.direction) && (prompt === undefined || ASKS_DIRECTION.test(prompt));
  const directionOk = gradeDirection ? detectDirection(answer) === q.direction : true;

  const correct = !!valueOk && unitOk && directionOk;
  // Partial credit: value is the main thing; unit + direction are worth 0.15 each.
  let score = 0;
  if (valueOk) score += 0.7;
  if (unitOk) score += gradeUnit ? 0.15 : 0;
  if (directionOk) score += gradeDirection ? 0.15 : 0;
  if (!gradeUnit) score += 0.15;
  if (!gradeDirection) score += 0.15;
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
    // The direction is left off when it was not graded, so a student is never
    // shown "8 Nm clockwise" as the answer to a question that asked only for
    // the turning effect.
    // The unit stays in the right answer even when it was not required —
    // deliberately unlike the direction. Showing "5 m" teaches the unit to a
    // student who wrote a bare 5 and got the mark anyway, whereas naming a
    // direction on a question that could not determine one just misleads.
    correctAnswer: correct
      ? undefined
      : [q.expected, q.unit, gradeDirection ? q.direction : null].filter(Boolean).join(" "),
    details: {
      valueOk: !!valueOk,
      unitOk,
      unitGraded: gradeUnit,
      directionOk,
      directionGraded: gradeDirection,
      parsedValue: parsed,
    },
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

// "the speed" and "speed" are the same answer to a blank.
//
// "The slope of a distance-time graph gives you ____" accepts "speed", and a
// student who writes "the speed" has written a better sentence and was marked
// wrong for it. An article carries no physics, and this is a tool for students
// writing in a second language — the population most likely to add one, or to
// leave one out. Stripped from BOTH sides, so a mark scheme that says "a
// plotting compass" also accepts "plotting compass".
//
// Never strips the whole answer away: a one-word answer of "a" stays "a".
function dropArticle(s: string): string {
  const without = s.replace(/^(a|an|the)\s+/, "");
  return without.length > 0 ? without : s;
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
    if (given === want || toZ(given) === toZ(want)) return true;
    const g = dropArticle(given);
    const w = dropArticle(want);
    return g === w || toZ(g) === toZ(w);
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

/**
 * @param prompt the question as the student read it. Optional, and only the
 * numeric grader consults it — to avoid demanding a direction the question
 * never asked for. Omitting it grades leniently rather than strictly.
 */
export function grade(q: Question, answer: string, prompt?: string): GradeResult {
  switch (q.kind) {
    case "numeric":
      return gradeNumeric(q, answer, prompt);
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
