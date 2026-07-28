import type { Question } from "@/lib/grade";

// Structural checks a generated question must pass before anyone sees it.
//
// These are the faults that make a question impossible to answer correctly
// rather than merely hard — a student who knows the material still loses the
// mark. Measured on a real deck, roughly one question in twelve failed one of
// these, so they are not hypothetical.
//
// Deliberately deterministic and free: no model call, no judgement, only
// facts about the question's own shape. Semantic problems — a question the
// source cannot answer — need the verification pass in verify.ts.

export type QuestionProblem = string;

// A prompt opening this way wants a description, not a quantity. Generation
// produced "How long does a temporary magnet keep its magnetic properties?"
// as a NUMERIC question answered 0, when the source says "a short time" —
// there is no number in the material, so no numeric answer can be right.
const QUALITATIVE_OPENER = /^\s*(how long|how does|why|what happens|which|who)\b/i;

// A true/false prompt has to be a statement to judge. "…what happens to it?"
// answered `true` is unanswerable — the student loses the mark whatever they
// pick. The explicit "True or false: …?" form is fine and stays allowed.
const ENDS_AS_QUESTION = /\?\s*$/;
const EXPLICIT_TRUE_FALSE = /^\s*true\s+or\s+false/i;

export function validateQuestion(prompt: string, question: Question): QuestionProblem[] {
  const problems: QuestionProblem[] = [];
  if (!prompt.trim()) problems.push("empty prompt");

  switch (question.kind) {
    case "mcq": {
      const options = question.options ?? [];
      if (options.length < 3) {
        problems.push("fewer than three options");
      }
      // Two identical options mean two correct answers, or a distractor that
      // is the answer wearing a different letter.
      if (new Set(options.map(normalise)).size !== options.length) {
        problems.push("duplicate options");
      }
      // "correct" names a letter; if it falls outside the options the
      // question can never be marked right.
      if (options.length > 0 && indexOfChoice(question.correct, options.length) === -1) {
        problems.push(`correct answer "${question.correct}" is not one of the options`);
      }
      break;
    }

    case "matching": {
      const lefts = question.pairs.map((p) => normalise(p.left));
      const rights = question.pairs.map((p) => normalise(p.right));
      if (question.pairs.length < 3) problems.push("fewer than three pairs");

      // Two rows offering the same meaning cannot be told apart: a student
      // who swaps them is marked wrong for an answer that is equally true.
      if (new Set(rights).size !== rights.length) problems.push("two pairs share the same meaning");

      // The same term on two rows has the same problem in reverse — nothing
      // tells the student which row wants which meaning. This is the shape
      // that produced "Electromagnet / Permanent magnet / Electromagnet /
      // Permanent magnet" with four properties between them.
      if (new Set(lefts).size !== lefts.length) problems.push("the same term appears on more than one row");

      if (question.pairs.some((p) => !p.left.trim() || !p.right.trim())) problems.push("empty term or meaning");
      break;
    }

    case "fill": {
      // Without a visible gap the student is guessing which word was removed.
      if (!/_{2,}/.test(prompt)) problems.push("no blank shown in the prompt");
      if (question.accept.length === 0 || question.accept.every((a) => !a.trim())) {
        problems.push("no accepted answer");
      }
      break;
    }

    case "numeric": {
      if (!Number.isFinite(question.expected)) problems.push("expected value is not a number");
      if (QUALITATIVE_OPENER.test(prompt)) {
        problems.push("numeric question asked about something the source answers in words");
      }
      break;
    }

    case "truefalse": {
      if (ENDS_AS_QUESTION.test(prompt) && !EXPLICIT_TRUE_FALSE.test(prompt)) {
        problems.push("true/false prompt is a question rather than a statement");
      }
      break;
    }
  }

  return problems;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Accepts "B", "b)", or "2" — the same forms the grader accepts.
function indexOfChoice(choice: string, optionCount: number): number {
  const key = choice.trim().toUpperCase().replace(/[).\s]/g, "");
  const index = /^[A-Z]$/.test(key) ? key.charCodeAt(0) - 65 : Number(key) - 1;
  return Number.isInteger(index) && index >= 0 && index < optionCount ? index : -1;
}
