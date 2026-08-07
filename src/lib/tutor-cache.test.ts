import { describe, expect, it } from "vitest";
import { buildSystemParts, buildSystemPrompt } from "./tutor";
import { cachedSystemParts } from "./ai";

// The cached half of the prompt has to be byte-identical across every variant
// a lesson can produce, or the split buys nothing.
//
// This is not a style rule. The approved deck is 87% of the prompt, and one
// lesson produces ninety distinct prompts across level × intent × turn ×
// Chinese. If one varying word leaks into the stable block, all ninety become
// separate cache entries again and the deck is re-sent at full price on every
// turn — silently, with nothing failing and only the bill to show for it.

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const INTENTS = ["explain", "translate", "example", "askme", "check"] as const;

async function everyVariant() {
  const out: { label: string; stable: string; variable: string }[] = [];
  for (const level of LEVELS)
    for (const intent of INTENTS)
      for (const turn of [0, 1, 2])
        for (const chinese of [false, true])
          for (const replied of [false, true])
            out.push({
              label: `${level}/${intent}/turn${turn}/${chinese ? "zh" : "en"}/${replied ? "replied" : "fresh"}`,
              ...(await buildSystemParts("moments", level, intent, turn, replied, chinese)),
            });
  return out;
}

describe("the cached half of the system prompt", () => {
  it("is identical across every variant one lesson can produce", async () => {
    const all = await everyVariant();
    expect(all.length).toBeGreaterThan(100);

    const first = all[0];
    for (const v of all) {
      // Named in the message so a failure says WHICH variant drifted.
      expect(v.stable === first.stable, `stable block differs for ${v.label}`).toBe(true);
    }
  });

  it("is where the approved material lives", async () => {
    // The whole point: the big static thing must be on the cached side.
    const { stable, variable } = await buildSystemParts("moments", "intermediate", "explain");
    expect(stable).toContain("APPROVED MATERIAL:");
    expect(stable).toContain("<source ");
    expect(variable).not.toContain("<source ");
  });

  it("carries the rules that never change, and none that do", async () => {
    const { stable, variable } = await buildSystemParts("moments", "beginner", "askme", 2, true, true);
    expect(stable).toContain("ABSOLUTE RULES");
    expect(stable).toContain("Answer ONLY using the APPROVED MATERIAL");
    expect(stable).toContain("NEVER complete a whole assignment");
    // The student-specific guidance belongs behind the breakpoint.
    expect(variable).toContain("TASK MODE:");
    expect(variable).toContain("WRITING FOR THIS STUDENT:");
  });

  it("points at the material in the direction the material actually is", async () => {
    // The corpus moved above the rules. A rule still saying "below" would send
    // the model looking the wrong way, and nothing else would catch it.
    const { stable } = await buildSystemParts("moments", "intermediate", "explain");
    expect(stable).toContain("<source> tags above");
    expect(stable).not.toContain("<source> tags below");
    expect(stable.indexOf("APPROVED MATERIAL:")).toBeLessThan(stable.indexOf("ABSOLUTE RULES"));
  });

  it("is the majority of what gets sent", async () => {
    // If this ever inverts, the split has stopped being worth its complexity.
    const { stable, variable } = await buildSystemParts("moments", "intermediate", "explain");
    expect(stable.length).toBeGreaterThan(variable.length * 3);
  });

  it("still reads as one prompt for a test or a probe", async () => {
    const { stable, variable } = await buildSystemParts("moments", "intermediate", "explain");
    const whole = await buildSystemPrompt("moments", "intermediate", "explain");
    expect(whole).toBe(`${stable}\n\n${variable}`);
  });
});

describe("cachedSystemParts", () => {
  it("puts the breakpoint after the stable block and not on the varying one", async () => {
    const [cached, live] = cachedSystemParts("STABLE", "VARIES");
    expect(cached.content).toBe("STABLE");
    expect(cached.providerOptions?.anthropic.cacheControl).toEqual({ type: "ephemeral" });
    expect(live.content).toBe("VARIES");
    expect("providerOptions" in live).toBe(false);
  });

  it("keeps the two in order, because the model reads them in order", () => {
    const parts = cachedSystemParts("first", "second");
    expect(parts.map((p) => p.content)).toEqual(["first", "second"]);
  });
});
