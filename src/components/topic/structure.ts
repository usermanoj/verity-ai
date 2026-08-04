import { COMPARATIVE_WORDS } from "@/lib/visuals/relationship";
// Recognises the shapes a physics lesson keeps writing in, so they can be
// laid out instead of run together as paragraphs.
//
// Every visual built from these is pure REFORMATTING: the words are the
// teacher's, in the teacher's order, with nothing added, dropped or
// paraphrased. That is what makes this safe where an AI-generated diagram
// would not be — there is no step at which a claim could be invented.
//
// Measured across all 68 pages of the three real Grade 7 decks before
// picking what to detect: comparison appears on 4 pages (including the
// permanent-vs-temporary section), formulas and cause-effect on a handful
// more. Anything rarer than that is not worth the risk of a wrong match.

export type Comparison = {
  lead: string;
  left: { title: string; points: string[] };
  right: { title: string; points: string[] };
};

export type Relationship = {
  lead: string;
  /** "Closer the poles" — the comparative and its subject, as written. */
  cause: string;
  effect: string;
  sentence: string;
  /**
   * The same two halves taken apart.
   *
   * The joined forms above read well in a card and cannot be reasoned about:
   * an interactive needs to know that "closer" points DOWN and "greater"
   * points UP before it can move anything. Split here rather than re-parsed
   * downstream, so there is one pattern for this sentence shape and not two
   * that can disagree — the mistake this codebase has made three times.
   */
  parts: { causeWord: string; causeThing: string; effectWord: string; effectThing: string };
};

export type Formula = { lead: string; result: string; expression: string; rest: string };

// "Permanent ('hard') magnetic materials (e.g. Steel): … Temporary ('soft')
// magnetic materials (e.g. Iron): …" — two labelled groups, each ending in a
// colon, with their own bullet lines underneath.
//
// Two is exact, not a minimum: three labelled groups is a taxonomy and reads
// better as a list, and one is just a heading.
export function detectComparison(text: string): Comparison | null {
  return fromLines(text) ?? fromInlineLabels(text);
}

// The chunker rewrites slide bullets into "complete, connected sentences", so
// by the time a comparison reaches a student it is usually ONE paragraph:
// "Permanent ('hard') materials (e.g. Steel): A permanent magnet keeps … .
// Temporary ('soft') materials (e.g. Iron): A temporary magnet keeps … ."
//
// Detecting on line breaks alone therefore worked on raw slide text and found
// nothing at all in production. Labels are found inline instead, and each
// group's sentences become its points.
function fromInlineLabels(text: string): Comparison | null {
  // Periods are allowed inside a label because physics labels are full of
  // them — "Permanent ('hard') magnetic materials (e.g. Steel):" is one
  // label, and excluding '.' truncated it to "Steel)". A label still has to
  // begin at a sentence boundary, so it cannot start mid-clause.
  const labels = findLabels(text);
  if (labels.length !== 2) return null;

  const [first, second] = labels;
  const left = { title: first.title, points: sentences(text.slice(first.contentAt, second.startsAt)) };
  const right = { title: second.title, points: sentences(text.slice(second.contentAt)) };
  if (left.points.length === 0 || right.points.length === 0) return null;

  const ratio = left.points.length / right.points.length;
  if (ratio > 3 || ratio < 1 / 3) return null;

  return { lead: text.slice(0, first.startsAt).trim(), left, right };
}

type Label = { title: string; startsAt: number; contentAt: number };

// Labels are found by walking BACK from each colon to the sentence that
// contains it, rather than forward from sentence starts.
//
// Matching forward needed periods allowed inside a label (for "(e.g. Steel)"),
// which let the pattern begin at "E.g. bar magnet, lodestone, earth." and run
// across the sentence boundary into the next label — swallowing a real point
// and deleting it from the lesson. Rejecting that match afterwards didn't
// help either, because the regex had already consumed the good label with it.
//
// Walking back from the colon has no such interaction: each colon yields
// exactly one candidate, independently of the others.
function findLabels(text: string): Label[] {
  const labels: Label[] = [];
  // Masked once, so an abbreviation's period never reads as a sentence end.
  // The mask is character-for-character, so offsets still line up with `text`.
  const masked = maskAbbreviations(text);

  for (const colon of text.matchAll(/:\s/g)) {
    const colonAt = colon.index;
    const sentenceStart = lastSentenceBreak(masked.slice(0, colonAt));
    const title = text.slice(sentenceStart, colonAt).trim();
    if (title.length < 4 || title.length > 90) continue;
    if (!/^[A-Z]/.test(title)) continue;
    labels.push({ title, startsAt: sentenceStart, contentAt: colonAt + colon[0].length });
  }
  return labels;
}

function lastSentenceBreak(before: string): number {
  let at = 0;
  for (const m of before.matchAll(/[.!?]\s+/g)) at = m.index + m[0].length;
  return at;
}

function maskAbbreviations(s: string): string {
  return s.replace(/\b(e\.g|i\.e|etc|vs|fig|no)\./gi, "$1․");
}

// Splits on sentence ends, but not on the "e.g." that a physics slide is full
// of — "E.g. bar magnet, lodestone, earth." must stay one point.
function sentences(block: string): string[] {
  return maskAbbreviations(block)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/․/g, ".").trim())
    .filter((s) => s.length > 1);
}

function fromLines(text: string): Comparison | null {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 4) return null;

  const headings: number[] = [];
  lines.forEach((line, i) => {
    // A label ends in a colon and is short enough to be a title rather than a
    // sentence that happens to contain one.
    if (/:$/.test(line) && line.length <= 90) headings.push(i);
  });
  if (headings.length !== 2) return null;

  const [a, b] = headings;
  // The second group must actually follow the first with content between
  // them, otherwise these are two adjacent labels, not two columns.
  if (b - a < 2 || b === lines.length - 1) return null;

  const left = { title: lines[a].replace(/:$/, ""), points: lines.slice(a + 1, b) };
  const right = { title: lines[b].replace(/:$/, ""), points: lines.slice(b + 1) };
  if (left.points.length === 0 || right.points.length === 0) return null;

  // Wildly lopsided groups are usually a mis-detection: a real contrast gives
  // both sides comparable weight.
  const ratio = left.points.length / right.points.length;
  if (ratio > 3 || ratio < 1 / 3) return null;

  return { lead: lines.slice(0, a).join(" "), left, right };
}

// "Greater the distance from the wire, weaker is the magnetic field."
// "Closer the poles, greater is the force."
//
// A comparative on each side of a comma is the sentence pattern a syllabus
// uses for every proportionality, and it is exactly the relationship students
// are asked to state back.
// Built from the one vocabulary in lib/visuals/relationship.ts, which also
// knows which way each word points. Two lists of comparatives is how the
// detector ends up finding a sentence the interactive cannot read.
const COMPARATIVE = `(${COMPARATIVE_WORDS.join("|")})`;
const RELATIONSHIP = new RegExp(
  `\\b${COMPARATIVE}\\b\\s+(?:the\\s+)?([^,.]{2,60}),\\s*(?:the\\s+)?\\b${COMPARATIVE}\\b\\s+(?:is\\s+|are\\s+)?(?:the\\s+)?([^.]{2,60})\\.`,
  "i",
);

export function detectRelationship(text: string): Relationship | null {
  const m = RELATIONSHIP.exec(text);
  if (!m) return null;

  const sentence = m[0].trim();
  return {
    lead: text.slice(0, m.index).trim(),
    cause: `${m[1]} ${m[2]}`.trim(),
    effect: `${m[3]} ${m[4]}`.trim(),
    sentence,
    parts: {
      causeWord: m[1].toLowerCase(),
      causeThing: m[2].trim(),
      effectWord: m[3].toLowerCase(),
      effectThing: m[4].trim(),
    },
  };
}

// "Moment = force × perpendicular distance from the pivot"
//
// Requires a real operator, so "Speed (m/s)" or "answer = 12" don't qualify —
// a formula is a relationship between named quantities, and highlighting a
// bare number as one teaches nothing.
const FORMULA = /^\s*([A-Za-z][\w\s()'-]{1,40}?)\s*=\s*([^=\n]{3,80}?[×x*/][^=\n]{1,80})\s*$/im;

export function detectFormula(text: string): Formula | null {
  const m = FORMULA.exec(text);
  if (!m) return null;
  // Guard against matching inside a worked calculation like
  // "(10-0)/(1-0) = 10m/s", where the left side is digits and brackets.
  if (!/[A-Za-z]{3}/.test(m[1])) return null;

  return {
    lead: text.slice(0, m.index).trim(),
    result: m[1].trim(),
    expression: m[2].trim(),
    rest: text.slice(m.index + m[0].length).trim(),
  };
}
