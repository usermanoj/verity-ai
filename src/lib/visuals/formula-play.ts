// A formula the teacher wrote, turned into something a student can move.
//
// Every interactive before this one is a bespoke component matched to a named
// concept by a regex: a lever, magnetic domains, a distance-time graph. That
// approach cannot generalise — you cannot hand-build a simulation for every
// idea in every subject, and the library ended up eight-tenths magnetism while
// two of the school's three decks were about motion.
//
// This one carries no subject knowledge at all. It reads the relationship out
// of the teacher's own sentence and lets a student change the inputs:
//
//   Moment = force x perpendicular distance from the turning point
//   Speed = distance / time
//   Density = mass / volume
//   Concentration = moles / volume
//   Area = length x width
//
// Nothing in that list is written down anywhere in this codebase. A physics
// deck, a chemistry deck and a maths deck all get the same treatment, because
// the only input is a sentence with an equals sign in it.
//
// THE HONESTY RULE still holds, and more easily than for the hand-built
// visuals: the relationship shown is quoted from the section, and the numbers
// are whatever the student chooses. Nothing is asserted that the teacher did
// not write.

export type PlayableFormula = {
  /** The quantity being defined — "Moment", "Speed", "M". */
  result: string;
  /** The named quantities it is built from, in order. */
  operands: string[];
  operator: "×" | "÷";
  /** The sentence it was read from, so a teacher can check it. */
  source: string;
};

/**
 * An operand must be a NAMED quantity, never a number.
 *
 * This is what separates a formula from a worked example. The moments deck
 * contains both, often in the same section:
 *
 *   Moment = force x perpendicular distance     a rule, worth playing with
 *   Turning effect = 2m x 4N = 8 Nm             one answer, already worked out
 *
 * Sliders on the second would be nonsense — the numbers are the point of it.
 * Rejecting anything with a digit in it also throws out "Slope = y2-y1 / x2-x1",
 * which is a real formula written with subscripts; that is a deliberate loss,
 * since a wrong reading of a formula teaches a wrong relationship and the
 * gradient interactive already covers that section.
 */
const NAMED = /^[^\d=]*[A-Za-z][^\d=]*$/;

/** Written by teachers as ×, x or *, and as / or ÷. */
const TIMES = /\s(?:×|x|\*)\s/;
const DIVIDE = /\s*(?:÷|\/)\s*/;

/**
 * Reads the first general formula out of a section.
 *
 * Works on flowing text rather than on whole lines. The detector this sits
 * beside (detectFormula, structure.ts) anchors its pattern to a line with ^ and
 * $, and slide extraction produces paragraphs — so it has matched nothing on
 * any real deck in this school, while "Moment = force x perpendicular distance
 * from the turning point" sat in the corpus unrecognised.
 *
 * Returns null for anything it is not sure of. A formula read wrongly is worse
 * than no formula at all: it would put a relationship on screen, in the
 * teacher's own lesson, that the teacher never stated.
 */
export function parseFormula(text: string): PlayableFormula | null {
  // Every equals sign is tried, not just the first.
  //
  // A slide's text runs a sentence and a formula together — "…the distance of
  // the force from pivot is 7cm. M = F x d" — and taking everything before the
  // first sign as the quantity's name builds a forty-word name and then throws
  // the whole formula away for having one. The name is what sits between the
  // previous sentence and the sign.
  for (const match of text.matchAll(/=/g)) {
    const found = read(text, match.index);
    if (found) return found;
  }
  return null;
}

function read(text: string, at: number): PlayableFormula | null {
  const before = text.slice(0, at);
  const boundary = Math.max(
    before.lastIndexOf(". "),
    before.lastIndexOf("; "),
    before.lastIndexOf(": "),
    before.lastIndexOf("\n"),
  );
  const result = quantityName(before.slice(boundary + 1));
  // The definition ends at the sentence end, or at a second equals sign — a
  // chain like "M = F x d ; d = 7cm" is two statements and only the first is
  // the rule.
  const afterRaw = text.slice(at + 1);
  let end = afterRaw.length;

  const sentenceEnd = afterRaw.search(/[.;]\s/);
  if (sentenceEnd >= 0) end = Math.min(end, sentenceEnd);

  // A second equals sign means a second statement, and slide extraction runs
  // them together: "M = F x d F = M / d". Cutting at the sign itself would
  // leave the next statement's subject dangling on the end of this one's last
  // operand — "d F" — so the cut goes back past the word that owns it.
  const second = afterRaw.indexOf("=");
  if (second >= 0) {
    const upTo = afterRaw.slice(0, second).replace(/\s+$/, "");
    const wordStart = upTo.lastIndexOf(" ");
    end = Math.min(end, wordStart >= 0 ? wordStart : 0);
  }

  const expression = afterRaw.slice(0, end).trim();

  if (!result || !expression) return null;
  // The name of a quantity, not a fragment of prose that happened to end in
  // one. Anything longer is a sentence with an equals sign in it.
  if (result.length > 40 || !/[A-Za-z]/.test(result) || /\d/.test(result)) return null;

  for (const [operator, pattern] of [
    ["×", TIMES],
    ["÷", DIVIDE],
  ] as const) {
    // Trailing sentence punctuation goes: a formula ending a sentence gives
    // "width." as an operand, and that is a full stop rather than part of the
    // quantity's name.
    const parts = expression.split(pattern).map((p) => p.trim().replace(/[.,;:]+$/, "").trim());
    if (parts.length !== 2) continue;
    if (!parts.every((p) => p.length > 0 && p.length <= 60 && NAMED.test(p))) continue;

    return {
      result,
      operands: parts,
      operator,
      source: `${result} = ${parts.join(` ${operator} `)}`,
    };
  }

  return null;
}

/**
 * Words that introduce a formula rather than name the thing it defines.
 *
 * Not a subject vocabulary — every one is a function word or a verb of
 * saying, and the list would be the same for a chemistry deck. Without it
 * "Ohm's law states that Voltage = current × resistance" names the quantity
 * "Ohm's law states that Voltage", and a slider appears under a sentence.
 */
const LEAD_IN = new Set([
  "a", "an", "and", "any", "are", "as", "be", "by", "for", "gives", "here",
  "if", "is", "it", "means", "or", "shows", "so", "state", "states", "that",
  "the", "then", "this", "to", "under", "we", "when", "where", "you",
]);

/** A quantity's name is short. Three words is "net turning effect". */
const MAX_NAME_WORDS = 3;

/**
 * The name of the quantity, out of whatever ran up to the equals sign.
 *
 * Walks backwards from the sign rather than forwards from the sentence, which
 * is the direction the name actually grows in: "…, Area", "…states that
 * Voltage". Stops at a comma or at a word that is doing grammar rather than
 * naming something.
 */
function quantityName(before: string): string {
  const afterComma = before.slice(before.lastIndexOf(",") + 1);
  const words = afterComma.trim().split(/\s+/).filter(Boolean);

  const kept: string[] = [];
  for (let i = words.length - 1; i >= 0 && kept.length < MAX_NAME_WORDS; i--) {
    if (LEAD_IN.has(words[i].toLowerCase())) break;
    kept.unshift(words[i]);
  }
  return kept.join(" ");
}

/** What the formula gives for a set of values. */
export function compute(formula: PlayableFormula, values: number[]): number | null {
  const [a, b] = values;
  if (a === undefined || b === undefined) return null;
  if (formula.operator === "÷") {
    if (b === 0) return null;
    return a / b;
  }
  return a * b;
}

/**
 * The calculation written out, the way a worked example writes it.
 *
 * Showing the substitution rather than only the answer is the whole point: a
 * student who sees "Moment = 4 × 3 = 12" is watching the rule being used,
 * which is what the section is teaching.
 */
export function workingOut(formula: PlayableFormula, values: number[]): string | null {
  const answer = compute(formula, values);
  if (answer === null) return null;
  const round = (n: number) => Math.round(n * 100) / 100;
  return `${formula.result} = ${round(values[0])} ${formula.operator} ${round(values[1])} = ${round(answer)}`;
}

/**
 * A short label for a slider, from a long operand name.
 *
 * "perpendicular distance from the turning point" does not fit beside a slider
 * and must not be silently truncated to "perpendicular distance from the tu" —
 * the last words are usually the ones that say which distance is meant. Cut at
 * a word instead, and only when it is genuinely too long.
 */
export function shortLabel(operand: string, max = 22): string {
  const clean = operand.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 8 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * The quantity's name mid-sentence.
 *
 * "Moment" becomes "moment", but "M" stays "M" — lowercasing a symbol gives
 * "watch m follow", which reads as a typo and is one. A name is only lowered
 * when it looks like a word: a capital followed by lower case.
 */
export function inSentence(result: string): string {
  return /^[A-Z][a-z]/.test(result) ? result.charAt(0).toLowerCase() + result.slice(1) : result;
}
