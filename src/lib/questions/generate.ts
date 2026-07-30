import { generateText, Output } from "ai";
import { z } from "zod";
import { aiModel, gatewayFailover, STRUCTURED_FALLBACK_MODELS, withRateLimitRetry } from "@/lib/ai";
import type { Question } from "@/lib/grade";
import { isNarrativeRecall } from "./narrative";
import { validateQuestion } from "./validate";
import { verifyQuestions } from "./verify";

// z.union, not z.discriminatedUnion.
//
// They describe the same thing to the model, but Zod serialises a
// discriminated union as JSON Schema `oneOf`, and OpenAI's strict structured
// outputs reject `oneOf` outright while accepting `anyOf`. The `kind` literal
// on each variant already tells the model which shape to fill, so nothing is
// lost — and the runtime parse is just as strict either way.
const QuestionSchema = z.union([
  z.object({
    kind: z.literal("numeric"),
    expected: z.number(),
    // nullable rather than optional: OpenAI's strict structured outputs
    // require every key in `properties` to appear in `required`, and Zod's
    // .optional() omits it. Anthropic accepted the optional form, so this
    // only broke on switching provider. Nulls are stripped below, since the
    // app's own Question type expresses "absent" as undefined.
    unit: z.string().nullable(),
    direction: z.enum(["clockwise", "anticlockwise"]).nullable(),
    tolerance: z.number().nullable(),
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
  "NARRATIVE MATERIAL — read this before writing anything.",
  "Some of the material is the story around the science rather than the science: who discovered something, when, where, and what it was called. Never test it.",
  "  · Never ask who discovered, invented, named or first described something.",
  "  · Never ask in what year, century or era something happened, and never make a date the answer.",
  "  · Never make a person, a place, a country or a civilisation the answer to a question.",
  "  · Never ask when something came into use, was first written about, or was first used somewhere.",
  "  · Never frame a question around what a historical figure or people said, wrote, described or did. If the science underneath is worth testing, ask it directly: \"A lodestone attracts a ____.\" — not \"What did the Chinese describe a lodestone attracting?\". The second tests whether the student followed the story.",
  "  · These facts are the easiest thing in a section to turn into questions and the least worth asking. A student who cannot name the discoverer still understands the physics — and for someone reading in a second language, an unfamiliar proper noun is difficulty that teaches nothing.",
  "",
  "If a section is ENTIRELY narrative — a history, an anecdote, a scene-setting introduction with no explanation in it — return an EMPTY list of questions. That is the correct answer for material with nothing to test, and it is expected. Do not pad the set with names and dates to reach five, and do not stretch a single passing scientific remark into seven questions.",
  "",
  "Rules, in priority order. Everything above outranks all of them — an empty set from a narrative section beats a full set that satisfies these:",
  "1. NEVER invent facts, numbers, examples or scenarios that are not in the source text or directly derivable from it. A question a student cannot answer from this material is a broken question.",
  "2. Every question must stand on its own. An mcq must name its options; a fill-in-the-blank must show the sentence with a blank; a matching question must list both columns. Never write 'which of the following' without the following.",
  "3. Keep the English plain and the sentences short. Test the physics, not the reading level — but keep subject terminology exact.",
  "4. Distractors must be plausible and wrong, drawn from the same topic. Never make the right answer the longest or most detailed option.",
  "5. Prefer at least one matching or fill question covering the section's key vocabulary, since that is what an ESL student most needs to retain.",
  "6. A matching question must have exactly one defensible pairing. Every term distinct, every meaning distinct, and no term that the source lets you pair with two different meanings. If the source does not state a meaning for a term, leave that term out — do not infer one.",
  "7. A fill-in-the-blank prompt must SHOW the gap as ____ inside the sentence, so the student can see which word was removed.",
  "8. Ask only what the source answers. If you find yourself reasoning past the text to justify an answer, that question does not belong in the set.",
  "9. Use numeric ONLY when the source states a number or gives a formula that produces one. If the source answers in words (\"a short time\", \"the far end\"), never force it into a number.",
  "10. A true/false prompt must be a STATEMENT the student judges, not a question. \"Iron is easy to magnetise.\" is right; \"What happens to iron?\" cannot be answered true or false.",
].join("\n");

// AI-assisted, not AI-decided: every generated question must be answerable
// strictly from the given chunk, and a human always approves before a
// student ever sees it (see ROADMAP.md §4's human-in-the-loop non-
// negotiable). The deterministic grader in lib/grade.ts never changes —
// this only produces more Question objects for it to grade.
// Set AI_VERIFY_QUESTIONS=0 to skip the verification pass. It costs one extra
// model call per section, which is real money on a large upload — but it is
// the only check that reads the source, so turning it off means trusting
// generation alone.
const VERIFY = process.env.AI_VERIFY_QUESTIONS !== "0";

export async function generatePracticeQuestions(chunkHeading: string | null, chunkText: string): Promise<GeneratedQuestion[]> {
  const { output } = await withRateLimitRetry(() =>
    generateText({
    model: aiModel("question"),
    system: SYSTEM_PROMPT,
    prompt: `Approved material${chunkHeading ? ` ("${chunkHeading}")` : ""}:\n${chunkText}`,
    output: Output.object({ schema: z.object({ questions: z.array(GeneratedQuestionSchema) }) }),
      providerOptions: gatewayFailover(STRUCTURED_FALLBACK_MODELS),
    }),
  );

  const generated = output.questions.map((q) => ({ ...q, question: withoutNulls(q.question) as Question }));

  // Three gates before a question is ever offered to a teacher.
  //
  // The first is free and deterministic: a question whose own shape makes it
  // unanswerable — duplicate options, a matching row with no unique pairing,
  // a fill-in-the-blank with no blank — is dropped outright. Measured on a
  // real deck, about one in twelve failed this.
  //
  // The second is also free: a question testing who discovered something and
  // when is answerable, well formed, and still not worth asking. See
  // narrative.ts for the section that prompted it.
  //
  // The third reads the source. It catches the well-formed question whose
  // answer simply is not in the material, which no structural rule can see
  // and which is the failure that actually costs a student marks.
  const wellFormed = generated.filter((q) => validateQuestion(q.prompt, q.question).length === 0);
  const teachable = wellFormed.filter((q) => !isNarrativeRecall(q.prompt, q.question));
  if (!VERIFY || teachable.length === 0) return teachable;

  const verified = await verifyQuestions(chunkHeading, chunkText, teachable);
  return verified.filter((v) => v.ok).map((v) => v.question);
}

// Turns the schema's explicit nulls back into absent keys.
//
// The schema has to say `unit: null` because OpenAI rejects optional fields,
// but the grader and the stored jsonb are cleaner without them — and a
// question carrying `"unit": null` reads, to anyone opening the row later,
// like a unit that failed to generate rather than one that was never wanted.
function withoutNulls(question: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(question).filter(([, value]) => value !== null));
}
