import { NextRequest, NextResponse } from "next/server";
import { claude, hasApiKey, MODEL } from "@/lib/claude";
import { GLOSSARY } from "@/data/corpus";

export const runtime = "nodejs";

const glossaryLines = Object.entries(GLOSSARY)
  .map(([en, v]) => `- "${en}" → ${v.zh}`)
  .join("\n");

export async function POST(req: NextRequest) {
  try {
    const { text, target } = (await req.json()) as { text: string; target?: string };
    const lang = target || "Simplified Chinese (简体中文)";

    if (!hasApiKey()) {
      // Minimal offline fallback for the demo sentence.
      return NextResponse.json({
        translation:
          "力矩是力的转动效果。力矩 = 力 × 到支点的垂直距离，单位是牛顿·米（Nm）。（演示模式翻译）",
        demo: true,
      });
    }

    const msg = await claude().messages.create({
      model: process.env.ANTHROPIC_TRANSLATE_MODEL || MODEL,
      max_tokens: 700,
      system:
        `You are a professional bilingual physics teacher translating study material into ${lang} for a Grade 7 ESL student. ` +
        `Translate faithfully and naturally, keeping the scientific meaning exact. Use this approved terminology glossary for consistency:\n${glossaryLines}\n` +
        `Return ONLY the translation, no preamble.`,
      messages: [{ role: "user", content: text }],
    });

    const translation = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");

    return NextResponse.json({ translation, demo: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ translation: `⚠️ ${message}`, error: true }, { status: 200 });
  }
}
