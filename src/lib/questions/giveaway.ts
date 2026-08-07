import type { Question } from "@/lib/grade";
import { indexOfChoice } from "./validate";

// A question whose answer is sitting inside the question.
//
// This is not a malformed question — validateQuestion passes all of these, and
// so did all 219 in the school's bank. It is a question that measures nothing:
//
//   "Permanent magnets are made from ______ magnetic materials."   accepts "permanent"
//   "…the domains point to north, and the head of the arrow shows ____."   accepts "north"
//
// A student who has read nothing copies the word across and is marked correct.
// That matters more than it used to: the per-topic strengths panel now tells a
// teacher who is secure on what, and a question anyone can answer makes every
// student look secure.
//
// WHY THIS WARNS RATHER THAN REJECTS. The same test also catches
//
//   "When an iron nail touches a permanent magnet, it becomes a ____ itself."   accepts "magnet"
//
// where "magnet" is in the prompt as part of a different thing — the magnet
// doing the inducing, not the nail becoming one. That is a fair question. No
// string test can separate it from the two above, and a rule that silently
// dropped it would lose a good question with nobody able to see that it had.
// A teacher reads every question before it ships; this puts the doubt in front
// of them and lets them judge.
//
// Pure and deterministic: no model call, and it runs in the teacher's browser
// at review time, so it costs a student nothing.

/** Answers too short to be evidence of anything — "is", "a", "up". */
const MIN_LENGTH = 4;

/**
 * The answer that is visible in the question, or null.
 *
 * Returns the offending text rather than a boolean so the teacher is told
 * which word gave it away instead of being asked to hunt for it.
 */
export function visibleAnswer(prompt: string, question: Question): string | null {
  // The column is `jsonb not null`, which stops a SQL NULL and allows the JSON
  // value null straight through. This runs in the teacher's ingest panel over
  // every question on a deck, so one malformed row must not be able to take
  // the page down and strand a whole upload.
  if (!question || typeof question !== "object") return null;

  // The blank itself is not a hiding place: "____" must not match anything,
  // and removing it prevents an accepted answer being found inside the run of
  // underscores' surroundings.
  const haystack = prompt.replace(/_+/g, " ");

  switch (question.kind) {
    case "fill":
      return (question.accept ?? []).find((a) => appearsIn(haystack, a)) ?? null;

    case "mcq": {
      const options = question.options ?? [];
      const index = indexOfChoice(question.correct, options.length);
      if (index === -1) return null;

      // Only worth reporting when the RIGHT option is in the prompt and the
      // wrong ones are not. "Which of these is a magnet: a magnet, a nail…"
      // lists every option in the prompt and gives nothing away by doing so.
      const correct = options[index];
      if (!appearsIn(haystack, correct)) return null;
      const distractorsAlsoShown = options.some((o, i) => i !== index && appearsIn(haystack, o));
      return distractorsAlsoShown ? null : correct;
    }

    // A true/false statement has no answer text to leak, and a matching
    // question shows every term and every meaning by design.
    default:
      return null;
  }
}

/** Whole words only, so "north" is not found inside "northerly". */
function appearsIn(haystack: string, answer: string): boolean {
  const needle = answer.trim();
  if (needle.length < MIN_LENGTH) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}
