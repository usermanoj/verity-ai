import { generateText, Output } from "ai";
import { z } from "zod";
import { MODEL } from "@/lib/ai";
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
    correct: z.string(),
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

// AI-assisted, not AI-decided: every generated question must be answerable
// strictly from the given chunk, and a human always approves before a
// student ever sees it (see ROADMAP.md §4's human-in-the-loop non-
// negotiable). The deterministic grader in lib/grade.ts never changes —
// this only produces more Question objects for it to grade.
export async function generatePracticeQuestions(chunkHeading: string | null, chunkText: string): Promise<GeneratedQuestion[]> {
  const { output } = await generateText({
    model: MODEL,
    system:
      "You are generating practice questions for ESL students, strictly grounded in the approved material given. " +
      "Generate exactly one question at each difficulty level (Easy, Medium, Challenge), based ONLY on the concept " +
      "in the text — never invent facts, numbers, or scenarios not present in or directly derivable from the source. " +
      "Prefer numeric questions with a clear expected value, unit, and (if applicable) direction when the source " +
      "describes a formula or worked example; use a multiple-choice question only when a numeric answer doesn't fit.",
    prompt: `Approved material${chunkHeading ? ` ("${chunkHeading}")` : ""}:\n${chunkText}`,
    output: Output.object({ schema: z.object({ questions: z.array(GeneratedQuestionSchema) }) }),
  });

  return output.questions;
}
