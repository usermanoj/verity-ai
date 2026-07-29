import { NextRequest, NextResponse } from "next/server";
import { hasApiKey } from "@/lib/ai";
import { contentRepo } from "@/lib/content-repo";
import { describeIssues, hasBlockingIssue } from "@/lib/translate/checks";
import { translatePassage } from "@/lib/translate/translate";
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
    const { text: translated, issues } = await translatePassage(text, glossary, lang);

    // Never silently: a translation that failed a check and was served anyway
    // has to leave a trace, or the next report of "the Chinese looked wrong"
    // has nothing behind it.
    if (issues.length > 0) console.warn(`[api/translate] served with issues: ${describeIssues(issues)}`);

    // Stored only if it passed. Remembering a translation that failed a check
    // would serve the same fault to every future student, quickly and for
    // free, which is the worst possible thing for a cache to be good at.
    if (!hasBlockingIssue(issues)) {
      await rememberTranslation(text, translated, memoryDocId);
    }

    return NextResponse.json({
      translation: translated,
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
