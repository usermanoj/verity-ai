import { describe, expect, it } from "vitest";
import { replyBudget } from "./tutor";

describe("replyBudget", () => {
  it("keeps the first Explain short", () => {
    // The complaint that started this: the first tap returned the entire
    // topic into a ~380px chat column.
    expect(replyBudget("explain", 0).words).toBe(55);
  });

  it("grows with each repeat tap", () => {
    const words = [0, 1, 2].map((t) => replyBudget("explain", t).words);
    expect(words).toEqual([55, 90, 130]);
    // Strictly increasing — depth is earned, never taken away.
    expect(words[0]).toBeLessThan(words[1]);
    expect(words[1]).toBeLessThan(words[2]);
  });

  it("stops growing rather than running away on the tenth tap", () => {
    expect(replyBudget("explain", 9).words).toBe(130);
  });

  it("leaves generous token headroom so replies are never cut mid-sentence", () => {
    for (const turn of [0, 1, 2]) {
      const { words, maxOutputTokens } = replyBudget("explain", turn);
      // English runs ~1.4 tokens/word; 4x leaves room for markdown too.
      expect(maxOutputTokens).toBeGreaterThan(words * 2);
    }
  });

  it("never caps a translation, which must not lose its ending", () => {
    expect(replyBudget("translate", 0).words).toBe(0);
    expect(replyBudget("translate", 0).maxOutputTokens).toBe(800);
  });

  it("keeps Socratic questions and hints to one short beat", () => {
    expect(replyBudget("askme", 0).words).toBe(45);
    expect(replyBudget("check", 3).words).toBe(45);
  });
});
