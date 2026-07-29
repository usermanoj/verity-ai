import type { Question } from "@/lib/grade";
import { indexOfChoice } from "./validate";

// Questions about the story around the science, rather than the science.
//
// The first real finding the Insights page produced was a section — "Early
// history of magnetism" — where a student answered five questions and got all
// five wrong. Reading them explains it: they asked who first described
// lodestones and where. That is not a student who has misunderstood
// magnetism; it is a set of questions that never tested magnetism.
//
// Narrative asides are the easiest part of any section to turn into questions
// — they are full of concrete, checkable facts — and the least worth asking.
// For a student reading in a second language they are worse than useless: an
// unfamiliar proper noun is difficulty that teaches nothing, and getting it
// wrong tells a teacher nothing either, because the analytics then report a
// physics concept as failed when the physics was never asked about.
//
// Three layers stop these, in decreasing order of confidence:
//   1. generate.ts tells the model not to write them, and to return nothing
//      at all for a section that is entirely narrative.
//   2. verify.ts tells the checker to reject any that appear anyway.
//   3. this file, the free deterministic backstop for what survives both.
//
// Deliberately narrow. It fires only on phrasings with no plausible physics
// reading, because silently dropping a real question is a worse fault than
// keeping a weak one — a teacher can reject a weak question, but cannot
// review one they were never shown.

// Prompts that are asking about history whatever the subject.
//
// Note what is NOT here: a bare "when" or "who". "When does a temporary
// magnet lose its magnetism?" and "Who does the right-hand rule apply to?"
// are ordinary questions, so the historical verbs have to appear too.
//
// The verbs carry their own inflections because the same question arrives as
// "Who discovered…", "Who is credited with discovering…" and "Who was the
// first to describe…" — one spelling would catch a third of them.
const HISTORY_VERB = "(?:discover|invent|nam|describ|creat|develop|propos|credit|found)(?:e|ed|es|ing|s)?|built|building|wrote|writing|written";

const HISTORICAL_PROMPT = [
  new RegExp(`\\bwho\\b[^.?!]{0,40}?\\b(?:${HISTORY_VERB})\\b`, "i"),
  /\bin\s+(?:which|what)\s+(?:year|century|decade|era|period)\b/i,
  /\b(?:which|what)\s+(?:year|century)\s+(?:was|were|did)\b/i,
  /\bwhen\s+(?:was|were|did)\b(?:[^.?]*?)\b(?:discovered|invented|first\s+(?:used|found|made|described))\b/i,
  // "Which ancient civilisation…", and also "Which person used magnets for
  // surgical purposes…" — the same question with a different noun, which the
  // first draft of this file let through. Up to two adjectives in between, so
  // "which ancient Greek scholar" is covered.
  new RegExp(
    "\\b(?:which|what)\\s+(?:\\w+\\s+){0,2}?" +
      "(?:civilisation|civilization|culture|empire|dynasty|person|people|scientist|scholar|philosopher|inventor|physician|mathematician|country|nation)\\b",
    "i",
  ),
  /\baccording to (?:legend|tradition|history)\b/i,
];

// Answers that are a date. A century or an era marker has no other reading —
// unlike a bare four-digit number, which in physics might be a real quantity,
// so that case is left alone rather than guessed at.
//
// Centuries are matched spelled out as well as in figures: "in the first
// century" is the same question as "in the 1st century", and only one of
// them was being caught. "second century" cannot collide with the unit of
// time — no measurement is ever phrased that way.
const CENTURY_WORD =
  "first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty-first";

const DATE_ANSWER = [
  /\b\d{1,2}(?:st|nd|rd|th)\s+century\b/i,
  new RegExp(`\\b(?:${CENTURY_WORD})\\s+century\\b`, "i"),
  /\b\d{1,4}\s*(?:BCE|BC|AD|CE)\b/,
  /\b(?:circa|c\.)\s*\d{3,4}\b/i,
  // The date question that defeats every rule above: the date is the BLANK.
  //
  // "The Chinese wrote about magnetism in the ____ century BC." carries no
  // date in the prompt (it has been removed) and none in the answer, which is
  // the bare word "fourth". A live generation run produced two of these, so
  // this is the shape that actually gets through rather than a hypothetical.
  /_{2,}\s*(?:century|centuries|BCE|BC|AD|CE)\b/i,
  /\b(?:century|year)\s+_{2,}/i,
];

/**
 * True when a question tests the history around a topic rather than the topic.
 *
 * Checks the prompt and the marked answer. Distractors are ignored on
 * purpose: a plausible-but-wrong date sitting beside a real answer does not
 * make the question a history question.
 */
export function isNarrativeRecall(prompt: string, question: Question): boolean {
  if (HISTORICAL_PROMPT.some((re) => re.test(prompt))) return true;
  // The prompt is checked for dates as well as the answer, because a
  // true/false statement carries its date in the prompt and has no answer
  // text at all.
  return [prompt, ...answerTexts(question)].some((text) => DATE_ANSWER.some((re) => re.test(text)));
}

// What the student has to produce, as words. Numeric questions contribute
// nothing: a year would arrive as a bare number indistinguishable from a
// measurement, and guessing between the two is exactly what this file avoids.
function answerTexts(question: Question): string[] {
  switch (question.kind) {
    case "mcq": {
      const options = question.options ?? [];
      const index = indexOfChoice(question.correct, options.length);
      return index === -1 ? [question.correct] : [options[index]];
    }
    case "fill":
      return [...question.accept];
    case "matching":
      return question.pairs.flatMap((p) => [p.left, p.right]);
    case "truefalse":
      // The explanation, since a true/false statement about a date carries
      // the date in its reason rather than in any answer field.
      return question.because ? [question.because] : [];
    case "numeric":
      return [];
  }
}
