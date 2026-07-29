import { generateText } from "ai";
import { aiModel, gatewayFailover, GATEWAY_FALLBACK_MODELS } from "@/lib/ai";
import { hasLangfuse } from "@/lib/observability";
import { checkTranslation, describeIssues, hasBlockingIssue, type CheckIssue, type Glossary } from "./checks";

// One translation, done properly — the prompt, the quality gate and the
// corrective retry in a single place.
//
// It lives here because there are now two callers: a student tapping
// Translate, and the batch pass that runs when a teacher approves a document.
// Two copies of a prompt this specific would drift, and the drift would show
// up as the same passage reading differently depending on which path produced
// it — the precise inconsistency the glossary exists to prevent.

export const DEFAULT_LANG = "Simplified Chinese (简体中文)";

export type TranslationResult = { text: string; issues: CheckIssue[] };

export async function translatePassage(
  text: string,
  glossary: Glossary,
  lang: string = DEFAULT_LANG,
): Promise<TranslationResult> {
  const glossaryLines = Object.entries(glossary)
    .map(([en, v]) => `- "${en}" → ${v.zh}`)
    .join("\n");

  const run = (correction: string) =>
    generateText({
      model: aiModel("translate"),
      maxOutputTokens: 700,
      // Translating the same passage twice produced two different renderings —
      // 铁心 one tap, 铁芯 the next. For a student checking their understanding
      // that reads as one of them being wrong. Nothing here is creative work;
      // the same English should always give the same Chinese.
      temperature: 0,
      system:
        `You are a professional bilingual physics teacher translating study material into ${lang} for a Grade 7 ESL student. ` +
        `Translate faithfully and naturally, keeping the scientific meaning exact. Every number, unit and symbol must appear ` +
        `unchanged. Use this approved terminology glossary for consistency:\n${glossaryLines}\n` +
        `Return ONLY the translation, no preamble.${correction}`,
      prompt: text,
      experimental_telemetry: { isEnabled: hasLangfuse(), functionId: "translate" },
      providerOptions: gatewayFailover(GATEWAY_FALLBACK_MODELS),
    });

  let result = await run("");
  let issues = checkTranslation(text, result.text, glossary);

  // One corrective retry, and only for the errors worth spending it on: a
  // dropped number or an untranslated passage is a fact the student has no way
  // to check for themselves. A terminology warning is logged, not retried —
  // withholding a usable translation over word choice serves nobody, and
  // doubles the cost of every tap.
  if (hasBlockingIssue(issues)) {
    console.warn(`[translate] retrying after: ${describeIssues(issues)}`);
    const retry = await run(
      `\n\nYour previous attempt was rejected: ${describeIssues(issues)}. ` +
        `Translate the WHOLE passage, keep every number exactly as written, and output nothing but the translation.`,
    );
    const retryIssues = checkTranslation(text, retry.text, glossary);
    // Keep whichever attempt is sounder rather than assuming the retry is.
    if (!hasBlockingIssue(retryIssues) || retryIssues.length < issues.length) {
      result = retry;
      issues = retryIssues;
    }
  }

  return { text: result.text, issues };
}
