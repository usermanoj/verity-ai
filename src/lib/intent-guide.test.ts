import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./tutor";

// buildSystemPrompt reads the corpus, which falls back to the seeded demo
// topic when the id is unknown — enough to inspect the instructions.
const promptFor = (intent: Parameters<typeof buildSystemPrompt>[2], turn: number, replied: boolean) =>
  buildSystemPrompt("moments", "intermediate", intent, turn, replied);

describe("tap again vs answered", () => {
  it("does not accuse a student of failing when they only tapped the button again", async () => {
    // The bug: tapping Give Example a second time — as the reply invited —
    // was met with "It's okay not to know."
    const prompt = await promptFor("example", 1, false);
    expect(prompt).toContain("they tapped the button again");
    expect(prompt).not.toContain("fine not to know");
  });

  it("judges the attempt when the student actually typed one", async () => {
    const prompt = await promptFor("example", 1, true);
    expect(prompt).toContain("REPLYING");
    expect(prompt).toContain("try the SAME question again");
  });

  it("applies the same distinction to Ask Me Questions", async () => {
    expect(await promptFor("askme", 1, false)).toContain("they tapped the button again");
    expect(await promptFor("askme", 1, true)).toContain("just answered your previous guiding question");
  });

  it("stops guiding and explains after two failed attempts", async () => {
    expect(await promptFor("askme", 1, true)).toContain("failed TWICE");
    expect(await promptFor("example", 1, true)).toContain("failed TWICE");
  });
});

describe("first-answer invitation", () => {
  it("invites another tap only for Explain", async () => {
    expect(await promptFor("explain", 0, false)).toContain("tap the button again to go deeper");
  });

  it("never tells a student to tap again in the same breath as asking them a question", async () => {
    // "Now you try: why can an electromagnet be turned off? Tap again to go
    // deeper." — two contradictory instructions, and the cause of the bug above.
    expect(await promptFor("example", 0, false)).not.toContain("tap the button again");
    expect(await promptFor("askme", 0, false)).not.toContain("tap the button again");
  });
});
