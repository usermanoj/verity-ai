import { generateText, Output } from "ai";
import { z } from "zod";
import { aiModel, gatewayFailover, STRUCTURED_FALLBACK_MODELS, withRateLimitRetry } from "@/lib/ai";
import type { GeneratedQuestion } from "./generate";

// A second model pass that checks each question against the material it came
// from, before a teacher is ever asked to approve it.
//
// Structural checks in validate.ts catch questions that are impossible to
// answer. This catches the ones that look perfectly well formed and are still
// wrong — which is the more dangerous failure, because nothing about them
// looks off until a student loses a mark for being right.
//
// A real example from the Grade 7 magnetism deck. The source says only:
//
//   "A North pole induces a North pole in the far end and south pole in the
//    near end of the nail."
//
// Generation produced a matching question pairing "North pole", "South pole"
// and "Induced magnetism" with three meanings. The source never says what a
// SOUTH pole induces, so one row had no answer in the material at all — and
// "North pole" legitimately matched two of the options. Both faults are
// invisible to any structural rule; only reading the source catches them.
//
// Marking is deterministic and never involves a model (lib/grade.ts). This
// pass judges the QUESTION, not a student's answer.

const VerdictSchema = z.object({
  index: z.number().describe("0-based position of the question being judged"),
  ok: z.boolean().describe("true only if the question is fully answerable from the source and the marked answer is right"),
  reason: z.string().describe("If not ok, the specific fault in one short sentence. Empty string if ok."),
});

const SYSTEM_PROMPT = [
  "You are checking practice questions against the ONLY material a student is allowed to learn from.",
  "For each question, decide whether it is safe to show. Be strict: this material is used in school, and a wrong question costs a student marks for an answer that was right.",
  "",
  "Mark a question NOT ok if any of these is true:",
  "1. Its answer is not stated in the source material. Inferring beyond the text does not count, however reasonable the inference.",
  "2. The marked answer is wrong, or incomplete, according to the source.",
  "3. More than one of the offered answers is defensible from the source.",
  "4. The question cannot be understood on its own — it refers to 'the diagram', 'the above', or context the student cannot see.",
  "5. It asks about something the source mentions but does not explain, so no answer is recoverable.",
  "6. It is a numeric question whose answer the source gives in words rather than as a number, or whose value cannot be computed from the source.",
  "7. It is a true/false question whose prompt is a question rather than a statement, so there is nothing to judge true or false.",
  "",
  "Mark it ok only when a careful student reading ONLY this source would arrive at exactly the marked answer.",
  "Judge every question you are given, and return one verdict per question with its index.",
].join("\n");

export type Verified = { question: GeneratedQuestion; ok: boolean; reason: string };

// Returns a verdict per question, in the order given. On any failure of the
// verification call itself, every question is returned as ok: a checker that
// is down must not silently empty a teacher's question bank — they still
// approve each one by hand, which is the guarantee that actually protects
// students.
export async function verifyQuestions(
  sourceHeading: string | null,
  sourceText: string,
  questions: GeneratedQuestion[],
): Promise<Verified[]> {
  if (questions.length === 0) return [];

  const listed = questions
    .map((q, i) => `[${i}] (${q.question.kind}) ${q.prompt}\n    answer: ${describeAnswer(q)}`)
    .join("\n");

  try {
    const { output } = await withRateLimitRetry(() =>
      generateText({
        model: aiModel("question"),
        system: SYSTEM_PROMPT,
        prompt: `SOURCE MATERIAL${sourceHeading ? ` ("${sourceHeading}")` : ""}:\n${sourceText}\n\nQUESTIONS:\n${listed}`,
        output: Output.object({ schema: z.object({ verdicts: z.array(VerdictSchema) }) }),
        providerOptions: gatewayFailover(STRUCTURED_FALLBACK_MODELS),
      }),
    );

    const byIndex = new Map(output.verdicts.map((v) => [v.index, v]));
    return questions.map((question, i) => {
      const verdict = byIndex.get(i);
      // A question the checker didn't return a verdict for is treated as
      // fine, for the same reason as a failed call: silence is not evidence
      // of a fault.
      return { question, ok: verdict ? verdict.ok : true, reason: verdict?.reason ?? "" };
    });
  } catch {
    return questions.map((question) => ({ question, ok: true, reason: "" }));
  }
}

// What the student would have to produce, rendered so the checker can judge
// it against the source without knowing our internal shapes.
function describeAnswer(q: GeneratedQuestion): string {
  const k = q.question;
  switch (k.kind) {
    case "mcq":
      return `${k.correct} — options: ${(k.options ?? []).join(" / ")}`;
    case "truefalse":
      return `${k.correct ? "True" : "False"}${k.because ? ` (because: ${k.because})` : ""}`;
    case "fill":
      return k.accept.join(" or ");
    case "matching":
      return k.pairs.map((p) => `${p.left} → ${p.right}`).join("; ");
    case "numeric":
      return [k.expected, k.unit, k.direction].filter(Boolean).join(" ");
  }
}
