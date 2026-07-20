import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { TRANSLATE_MODEL, hasApiKey } from "@/lib/ai";
import { hasLangfuse } from "@/lib/observability";
import { contentRepo } from "@/lib/content-repo";

export const runtime = "nodejs";

const MAX_TEXT_LEN = 2000;

export async function POST(req: NextRequest) {
  try {
    const { text, target, sourceId } = (await req.json()) as {
      text: string;
      target?: string;
      sourceId?: string;
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

    const glossary = await contentRepo.getGlossary();
    const glossaryLines = Object.entries(glossary)
      .map(([en, v]) => `- "${en}" → ${v.zh}`)
      .join("\n");

    const result = await generateText({
      model: TRANSLATE_MODEL,
      maxOutputTokens: 700,
      system:
        `You are a professional bilingual physics teacher translating study material into ${lang} for a Grade 7 ESL student. ` +
        `Translate faithfully and naturally, keeping the scientific meaning exact. Use this approved terminology glossary for consistency:\n${glossaryLines}\n` +
        `Return ONLY the translation, no preamble.`,
      prompt: text,
      experimental_telemetry: { isEnabled: hasLangfuse(), functionId: "translate" },
    });

    return NextResponse.json({ translation: result.text, demo: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ translation: `⚠️ ${message}`, error: true }, { status: 200 });
  }
}
