import { describe, expect, it } from "vitest";
import { parseCite } from "./SourceCite";

describe("parseCite", () => {
  // The real string from production: one deck, nine sections, the filename
  // repeated nine times.
  const REAL =
    "📖 Based on: Magnets and Electromagnets.pptx — Page/Section 1, Magnets and Electromagnets.pptx — Page/Section 4, " +
    "Magnets and Electromagnets.pptx — Page/Section 8, Magnets and Electromagnets.pptx — Page/Section 10";

  it("collapses the repeated filename to one", () => {
    expect(parseCite(REAL).file).toBe("Magnets and Electromagnets.pptx");
  });

  it("collects every section number", () => {
    expect(parseCite(REAL).sections).toEqual([1, 4, 8, 10]);
  });

  it("sorts and de-duplicates sections", () => {
    const cite = "📖 Based on: Deck.pptx — Page/Section 8, Deck.pptx — Page/Section 3, Deck.pptx — Page/Section 8";
    expect(parseCite(cite).sections).toEqual([3, 8]);
  });

  it("survives a filename containing a comma", () => {
    // Splitting on ", " would have torn this into two bogus entries.
    const cite = "📖 Based on: Unit 7, Magnets.pptx — Page/Section 5";
    expect(parseCite(cite)).toEqual({ file: "Unit 7, Magnets.pptx", sections: [5] });
  });

  it("strips the demo-mode suffix from the filename", () => {
    const cite = "📖 Based on: Deck.pptx — Page/Section 2 (demo mode)";
    expect(parseCite(cite).file).toBe("Deck.pptx");
  });

  it("reports no sections rather than inventing one when the format is unknown", () => {
    // The caller falls back to printing the original text — provenance is the
    // one thing here that must never silently vanish.
    expect(parseCite("📖 Based on: approved material").sections).toEqual([]);
  });
});
