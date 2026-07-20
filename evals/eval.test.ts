import { describe, expect, test } from "vitest";
import { NextRequest } from "next/server";
import { POST as tutorPost } from "@/app/api/tutor/route";
import { hasApiKey } from "@/lib/ai";
import { GOLDEN_SET } from "./golden-set";

// Reads the same NDJSON delta stream the client consumes (see
// consumeNdjsonStream in AiTutorPanel.tsx) down to plain accumulated text.
async function readNdjsonText(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (!line.trim()) continue;
      const evt = JSON.parse(line) as { type: string; text?: string };
      if (evt.type === "delta" && evt.text) text += evt.text;
    }
  }
  return text;
}

// True no-op (all cases show as skipped, not failed) until a real
// AI_GATEWAY_API_KEY is configured — see ROADMAP.md §7. Calls the actual
// /api/tutor route handler directly (not a duplicated prompt-construction
// path), so this can never silently drift from production behavior.
describe.skipIf(!hasApiKey())("Closed-corpus eval harness (golden set)", () => {
  for (const c of GOLDEN_SET) {
    test(
      c.name,
      async () => {
        const req = new NextRequest("http://localhost/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicId: c.topicId,
            intent: c.intent,
            level: c.level,
            question: c.question ?? "",
            answer: c.answer,
            turn: 0,
            history: [],
            contextChunkId: c.contextChunkId,
          }),
        });

        const res = await tutorPost(req);
        const text = await readNdjsonText(res);

        if (c.expectCitationOneOf) {
          expect(c.expectCitationOneOf.some((s) => text.includes(s))).toBe(true);
        }
        if (c.expectNoCitation) {
          expect(text).not.toContain("📖 Based on:");
        }
        if (c.expectNotContain) {
          for (const s of c.expectNotContain) {
            expect(text).not.toContain(s);
          }
        }
      },
      30_000,
    );
  }
});
