import { describe, expect, it } from "vitest";
import { followUpLabel } from "./AiTutorPanel";

// The assistant opens a deeper reply by naming the sub-topic in bold, so the
// student's own bubble can say what they're actually asking about instead of
// repeating "Help me with Magnets and Electromagnets" three times.
const DEEPER = "Now go deeper into **how an electromagnet works**.\n\nAn electromagnet is made when...";

describe("followUpLabel", () => {
  it("uses the opening question on the first tap", () => {
    expect(followUpLabel("Help me with Magnets", 0, "", DEEPER)).toBe("Help me with Magnets");
  });

  it("names the sub-topic the assistant moved on to", () => {
    expect(followUpLabel("Help me with Magnets", 1, "", DEEPER)).toBe("more on how an electromagnet works");
  });

  it("falls back to a plain label when the reply names no sub-topic", () => {
    expect(followUpLabel("Help me with Magnets", 2, "", "A magnet has two poles.")).toBe("go deeper");
  });

  it("always shows the student their own words when they typed some", () => {
    // Their question outranks anything we could infer.
    expect(followUpLabel("Help me with Magnets", 3, "why is iron used?", DEEPER)).toBe("why is iron used?");
  });

  it("ignores bold that only appears later in the reply", () => {
    // Only the opening line announces the sub-topic; bold further down is
    // ordinary emphasis and would mislabel the bubble.
    const body = "Here is the idea.\n\nIron is **temporary** magnetic material.";
    expect(followUpLabel("Help me with Magnets", 1, "", body)).toBe("go deeper");
  });

  it("does not use an over-long bold phrase as a label", () => {
    const long = `**${"x".repeat(80)}** is the idea`;
    expect(followUpLabel("Help me with Magnets", 1, "", long)).toBe("go deeper");
  });

  it("handles a missing previous reply", () => {
    expect(followUpLabel("Help me with Magnets", 1, "", undefined)).toBe("go deeper");
  });
});
