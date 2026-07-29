import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { aiModel, gatewayFailover, GATEWAY_FALLBACK_MODELS, hasApiKey } from "@/lib/ai";
import { hasLangfuse } from "@/lib/observability";
import { contentRepo } from "@/lib/content-repo";
import { checkTranslation, describeIssues, hasBlockingIssue } from "@/lib/translate/checks";
import { lookupTranslation, rememberTranslation } from "@/lib/translate/memory";

export const runtime = "nodejs";

const MAX_TEXT_LEN = 2000;

export async function POST(req: NextRequest) {
  try {
    const { text, target, sourceId, topicId } = (await req.json()) as {
      text: string;
      target?: string;
      sourceId?: string;
      topicId?: string;
    };

    // Defense in depth: reject oversized input before it reaches Claude,
    // regardless of the middleware's rate limit.
    if (!text || text.length > MAX_TEXT_LEN) {
      return NextResponse.json({ translation: "Invalid request.", error: true }, { status: 400 });
    }

    const lang = target || "Simplified Chinese (简体中文)";

    if (!hasApiKey()) {
      // Demo/offline mode: use a reviewed translation of the ACTUAL chunk that
      // was just explained (sourceId), rather than one generic canned string —
      // so Translate reflects what the student is really looking at.
      const reviewed = sourceId ? await contentRepo.getTranslation(sourceId) : undefined;
      const chunk = sourceId ? await contentRepo.getCorpusChunk(sourceId) : undefined;
      if (reviewed) {
        return NextResponse.json({
          translation: `${reviewed}\n\n📖 Based on: ${chunk?.source ?? "approved material"} (demo mode — reviewed translation)`,
          demo: true,
        });
      }
      return NextResponse.json({
        translation:
          "演示模式：暂无该内容的预先翻译。\n(Demo mode: no pre-reviewed translation for this exact text yet — enable the live AI for a full, accurate translation of anything.)",
        demo: true,
      });
    }

    // A stored translation wins outright, and a teacher's correction is the
    // reason this exists: once they fix a passage, every student from then on
    // reads the fixed version rather than the model's. Repeats also cost
    // nothing and arrive instantly, which matters on a shared class tablet.
    const memoryDocId = topicId && /^[0-9a-f-]{36}$/i.test(topicId) ? topicId : null;
    const remembered = await lookupTranslation(text, memoryDocId);
    if (remembered) {
      return NextResponse.json({
        translation: remembered.translation,
        demo: false,
        cached: true,
        origin: remembered.origin,
        issues: [],
      });
    }

    // This document's own terms, so 磁场 is used for "magnetic field" every
    // time and a student can match the translation back to the lesson. The
    // curated physics list was the only option before, which on a geography
    // upload was worse than none.
    const glossary = await contentRepo.getGlossary(topicId);
    const glossaryLines = Object.entries(glossary)
      .map(([en, v]) => `- "${en}" → ${v.zh}`)
      .join("\n");

    const translate = (correction: string) =>
      generateText({
        model: aiModel("translate"),
        maxOutputTokens: 700,
        // Translating the same passage twice produced two different renderings
        // — 铁心 one tap, 铁芯 the next. For a student checking their
        // understanding that reads as one of them being wrong. Nothing here is
        // creative work; the same English should always give the same Chinese.
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

    let result = await translate("");
    let issues = checkTranslation(text, result.text, glossary);

    // One corrective retry, and only for the errors worth spending it on: a
    // dropped number or an untranslated passage is a fact the student has no
    // way to check for themselves. A terminology warning is logged, not
    // retried — withholding a usable translation over word choice serves
    // nobody, and doubles the cost of every tap.
    if (hasBlockingIssue(issues)) {
      console.warn(`[api/translate] retrying after: ${describeIssues(issues)}`);
      const retry = await translate(
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

    // Never silently: a translation that failed a check and was served anyway
    // has to leave a trace, or the next report of "the Chinese looked wrong"
    // has nothing behind it.
    if (issues.length > 0) console.warn(`[api/translate] served with issues: ${describeIssues(issues)}`);

    // Stored only if it passed. Remembering a translation that failed a check
    // would serve the same fault to every future student, quickly and for
    // free, which is the worst possible thing for a cache to be good at.
    if (!hasBlockingIssue(issues)) {
      await rememberTranslation(text, result.text, memoryDocId);
    }

    return NextResponse.json({
      translation: result.text,
      demo: false,
      cached: false,
      origin: "model",
      // For logs and the teacher-facing view; the student sees the
      // translation either way.
      issues: issues.map((i) => ({ code: i.code, severity: i.severity })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ translation: `⚠️ ${message}`, error: true }, { status: 200 });
  }
}
