import { generateText, Output } from "ai";
import { z } from "zod";
import { MODEL, GATEWAY_FALLBACK_MODELS, withRateLimitRetry } from "@/lib/ai";
import type { Question } from "@/lib/grade";

const QuestionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("numeric"),
    expected: z.number(),
    unit: z.string().optional(),
    direction: z.enum(["clockwise", "anticlockwise"]).optional(),
    tolerance: z.number().optional(),
  }),
  z.object({
    kind: z.literal("mcq"),
    // Required, not optional. The schema carried only `correct`, so a
    // generated "Which of the following…" reached students as an empty text
    // box with nothing to choose from — unanswerable, and marked wrong
    // whatever they typed.
    options: z.array(z.string()).min(3).max(5).describe("The choices shown to the student, in order"),
    correct: z.string().describe("The letter of the correct option: A, B, C or D"),
  }),
  z.object({
    kind: z.literal("truefalse"),
    correct: z.boolean(),
    because: z.string().describe("One sentence explaining why, using only the source's own facts"),
  }),
  z.object({
    kind: z.literal("fill"),
    accept: z
      .array(z.string())
      .min(1)
      .describe("Every spelling that should count as correct, including British/American variants"),
  }),
  z.object({
    kind: z.literal("matching"),
    pairs: z.array(z.object({ left: z.string(), right: z.string() })).min(3).max(5),
  }),
]);

const GeneratedQuestionSchema = z.object({
  level: z.enum(["Easy", "Medium", "Challenge"]),
  prompt: z.string().describe("The question text shown to the student"),
  question: QuestionSchema,
});

export type GeneratedQuestion = {
  level: "Easy" | "Medium" | "Challenge";
  prompt: string;
  question: Question;
};

// One question per chunk at each of three levels produced a practice zone a
// student exhausted in a minute. A section is worth a short set that varies in
// both difficulty AND form: recall, recognition, vocabulary and connections
// are different skills, and a bank of only multiple choice trains guessing.
const SYSTEM_PROMPT = [
  "You are writing practice questions for ESL students (English is their second language), strictly grounded in the approved class material given.",
  "",
  "Write FIVE to SEVEN questions for this material, spanning Easy, Medium and Challenge, and MIX the formats:",
  "  numeric    — a value to calculate. Use whenever the source gives a formula or worked example.",
  "  mcq        — one right answer among 3-4 plausible options. ALWAYS supply the options themselves.",
  "  truefalse  — a statement to judge, with one sentence saying why.",
  "  fill       — a sentence with one key term removed. List every spelling that should count.",
  "  matching   — 3-5 term/meaning pairs. Ideal for vocabulary and for the key words of a topic.",
  "",
  "Rules, in priority order:",
  "1. NEVER invent facts, numbers, examples or scenarios that are not in the source text or directly derivable from it. A question a student cannot answer from this material is a broken question.",
  "2. Every question must stand on its own. An mcq must name its options; a fill-in-the-blank must show the sentence with a blank; a matching question must list both columns. Never write 'which of the following' without the following.",
  "3. Keep the English plain and the sentences short. Test the physics, not the reading level — but keep subject terminology exact.",
  "4. Distractors must be plausible and wrong, drawn from the same topic. Never make the right answer the longest or most detailed option.",
  "5. Prefer at least one matching or fill question covering the section's key vocabulary, since that is what an ESL student most needs to retain.",
].join("\n");

// AI-assisted, not AI-decided: every generated question must be answerable
// strictly from the given chunk, and a human always approves before a
// student ever sees it (see ROADMAP.md §4's human-in-the-loop non-
// negotiable). The deterministic grader in lib/grade.ts never changes —
// this only produces more Question objects for it to grade.
export async function generatePracticeQuestions(chunkHeading: string | null, chunkText: string): Promise<GeneratedQuestion[]> {
  const { output } = await withRateLimitRetry(() =>
    generateText({
    model: MODEL,
    system: SYSTEM_PROMPT,
    prompt: `Approved material${chunkHeading ? ` ("${chunkHeading}")` : ""}:\n${chunkText}`,
    output: Output.object({ schema: z.object({ questions: z.array(GeneratedQuestionSchema) }) }),
      providerOptions: { gateway: { models: GATEWAY_FALLBACK_MODELS } },
    }),
  );

  return output.questions;
}
