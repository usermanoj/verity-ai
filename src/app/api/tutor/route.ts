import { NextRequest, NextResponse } from "next/server";
import { claude, hasApiKey, MODEL } from "@/lib/claude";
import { buildSystemPrompt, fallbackReply, type Intent, type EslLevel } from "@/lib/tutor";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { intent, question, level, answer } = (await req.json()) as {
      intent: Intent;
      question: string;
      level: EslLevel;
      answer?: string;
    };

    if (!hasApiKey()) {
      return NextResponse.json({ reply: fallbackReply(intent, question), demo: true });
    }

    const system = buildSystemPrompt("moments", level ?? "intermediate", intent ?? "explain");
    const userText =
      intent === "check" && answer
        ? `Here is my attempt at: "${question}"\n\nMy answer/working: ${answer}\n\nGive me a hint about what to check — do not give the final answer.`
        : question || "Please help me understand this topic.";

    const msg = await claude().messages.create({
      model: MODEL,
      max_tokens: 800,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userText }],
    });

    const reply = msg.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");

    return NextResponse.json({ reply, demo: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { reply: `⚠️ The tutor had a problem: ${message}. Please try again.`, error: true },
      { status: 200 },
    );
  }
}
