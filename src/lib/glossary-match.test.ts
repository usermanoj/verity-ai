import { describe, expect, it } from "vitest";
import { splitByGlossary, type Glossary } from "./glossary-match";

// The real terms generated at ingestion for "Magnets and Electromagnets.pptx",
// verbatim from corpus_glossary — so this exercises what students actually get
// rather than a convenient fixture.
const REAL: Glossary = {
  magnetism: { en: "force that explains how magnets behave and interact", zh: "磁性（解释磁铁相互作用的现象）" },
  magnetic: { en: "able to be attracted to a magnet", zh: "有磁性的（会受磁铁吸引）" },
  "non-magnetic": { en: "not attracted to a magnet", zh: "非磁性的（不会受磁铁吸引）" },
  temporary: { en: "keeps magnet behavior for a short time", zh: "暂时性的（保持磁性的时间短）" },
  permanent: { en: "keeps magnet behavior for a long time", zh: "永久性的（能长时间保持磁性）" },
  "magnetic field": { en: "space around a magnet where it can push or pull", zh: "磁场（磁铁周围能作用的空间）" },
  pole: { en: "an end of a magnet where the force is strongest", zh: "磁极（磁力最强的一端）" },
  "north pole": { en: "the end of a magnet that points north", zh: "北极（指向北方的一端）" },
};

const terms = (text: string) =>
  splitByGlossary(text, REAL).filter((p) => p.kind === "term").map((p) => p.text);

describe("splitByGlossary", () => {
  it("finds a term in ordinary lesson prose", () => {
    expect(terms("Iron is a magnetic material.")).toEqual(["magnetic"]);
  });

  it("prefers the longer phrase over a word inside it", () => {
    // "magnetic" ahead of "magnetic field" is the ordering bug: the student
    // would get the gloss for the adjective and "field" left bare.
    expect(terms("The magnetic field circles the wire.")).toEqual(["magnetic field"]);
    expect(terms("Every magnet has a north pole.")).toEqual(["north pole"]);
  });

  it("matches a hyphenated term without also matching its tail", () => {
    // \b would have let "magnetic" match inside "non-magnetic".
    expect(terms("Rubber is non-magnetic.")).toEqual(["non-magnetic"]);
  });

  it("is case-insensitive but keeps the text as written", () => {
    const pieces = splitByGlossary("Magnetism is a force.", REAL);
    const term = pieces.find((p) => p.kind === "term");
    expect(term).toMatchObject({ text: "Magnetism", zh: "磁性（解释磁铁相互作用的现象）" });
  });

  it("does not match a term buried inside a longer word", () => {
    // "pole" must not light up inside "poles apart" — it should, that IS the
    // word — but never inside "polecat" or "interpolate".
    expect(terms("The results were interpolated.")).toEqual([]);
    expect(terms("Two poles repel.")).toEqual([]);
  });

  it("finds every occurrence, not just the first", () => {
    expect(terms("A permanent magnet and a temporary magnet differ.")).toEqual([
      "permanent",
      "temporary",
    ]);
  });

  it("loses no text: the pieces rejoin to the original", () => {
    const source = "A non-magnetic material near a magnetic field shows no magnetism at all.";
    const rejoined = splitByGlossary(source, REAL).map((p) => p.text).join("");
    expect(rejoined).toBe(source);
  });

  it("returns the text untouched when the document has no glossary", () => {
    // The empty-list bug built /\b()\b/, which matched at every position.
    const source = "A lesson with no generated terms.";
    expect(splitByGlossary(source, {})).toEqual([{ kind: "text", text: source }]);
  });

  it("survives a term containing regex metacharacters", () => {
    // Terms come from a model; an unescaped "(" would throw and blank the page.
    const odd: Glossary = { "f(x)": { en: "a function", zh: "函数" } };
    expect(() => splitByGlossary("Given f(x) = 2x", odd)).not.toThrow();
    expect(splitByGlossary("Given f(x) = 2x", odd).some((p) => p.kind === "term")).toBe(true);
  });

  it("ignores blank terms rather than matching everywhere", () => {
    const withBlank: Glossary = { ...REAL, "  ": { en: "", zh: "" } };
    expect(terms.call(null, "Iron is magnetic.")).toEqual(["magnetic"]);
    expect(splitByGlossary("Iron is magnetic.", withBlank).filter((p) => p.kind === "term")).toHaveLength(1);
  });
});
