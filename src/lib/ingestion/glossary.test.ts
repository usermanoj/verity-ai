import { describe, expect, it } from "vitest";
import { sanitiseGlossary } from "./glossary";

const entry = (term: string, en = "a definition", zh = "定义") => ({ term, en, zh });

describe("sanitiseGlossary", () => {
  it("keeps real subject vocabulary", () => {
    const out = sanitiseGlossary([entry("solenoid"), entry("magnetic field")]);
    expect(out.map((e) => e.term)).toEqual(["solenoid", "magnetic field"]);
  });

  it("drops duplicates that differ only by case", () => {
    // The unique index is on lower(term); two rows here would fail the whole
    // insert and cost the document its entire glossary.
    const out = sanitiseGlossary([entry("Solenoid"), entry("solenoid")]);
    expect(out).toHaveLength(1);
  });

  it("drops ordinary English a 12-year-old already knows", () => {
    expect(sanitiseGlossary([entry("the"), entry("used"), entry("when")])).toEqual([]);
  });

  it("drops a whole sentence masquerading as a term", () => {
    // Can't be highlighted in prose, and would swallow a line of the lesson.
    expect(sanitiseGlossary([entry("the force that acts without touching")])).toEqual([]);
  });

  it("drops entries missing a definition or a gloss", () => {
    expect(sanitiseGlossary([entry("solenoid", "", "定义"), entry("coil", "a definition", "  ")])).toEqual([]);
  });

  it("trims surrounding whitespace so terms match the text", () => {
    expect(sanitiseGlossary([entry("  coil  ")])[0].term).toBe("coil");
  });

  it("caps the list rather than underlining every other word", () => {
    const many = Array.from({ length: 60 }, (_, i) => entry(`term${i}`));
    expect(sanitiseGlossary(many).length).toBeLessThanOrEqual(30);
  });
});
