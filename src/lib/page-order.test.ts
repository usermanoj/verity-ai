import { describe, expect, it } from "vitest";
import { pageOf } from "./content-repo";

// Ordering decides whether a lesson reads as a lesson. A deck was rendering
// as slides 17, 18, 33, 3 because nothing sorted the chunks at all.
describe("pageOf", () => {
  it("reads the page number out of a generated citation", () => {
    expect(pageOf("Magnets and Electromagnets.pptx — Page/Section 17")).toBe(17);
  });

  it("orders numerically, not lexically", () => {
    const citations = [33, 3, 18, 17].map((n) => `Deck.pptx — Page/Section ${n}`);
    expect([...citations].sort((a, b) => pageOf(a) - pageOf(b)).map(pageOf)).toEqual([3, 17, 18, 33]);
  });

  it("tolerates a file name that itself contains digits", () => {
    expect(pageOf("Unit 7 — Topic 2 Magnets.pptx — Page/Section 5")).toBe(5);
  });

  it("sorts an unparseable citation last so it cannot displace section one", () => {
    expect(pageOf("some legacy citation")).toBe(Number.MAX_SAFE_INTEGER);
  });
});
