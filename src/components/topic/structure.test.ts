import { describe, expect, it } from "vitest";
import { detectComparison, detectFormula, detectRelationship } from "./structure";

// The inputs below are the real text of the Grade 7 decks, not invented
// samples. A layout that misrepresents a teacher's meaning is worse than a
// paragraph, so every detector must decline what it isn't sure about.
describe("detectComparison", () => {
  const permanentVsTemporary = [
    "Permanent and temporary magnetic materials",
    "Permanent (‘hard’) magnetic materials (e.g. Steel):",
    "A permanent magnet keeps its magnetic properties for long time.",
    "Are hard to magnetise.",
    "Do not easily lose their magnetism.",
    "Temporary (‘soft’) magnetic materials (e.g. Iron):",
    "A temporary magnet keeps its magnetic properties for short time.",
    "Are easy to magnetise.",
    "Easily lose their magnetism.",
  ].join("\n");

  it("splits two labelled groups into two columns", () => {
    const c = detectComparison(permanentVsTemporary);
    expect(c).not.toBeNull();
    expect(c!.left.title).toContain("Permanent");
    expect(c!.right.title).toContain("Temporary");
    expect(c!.left.points).toHaveLength(3);
    expect(c!.right.points).toHaveLength(3);
    expect(c!.lead).toBe("Permanent and temporary magnetic materials");
  });

  it("still finds the comparison after chunking has flattened it to one paragraph", () => {
    // This is the shape a student actually gets: the chunker rewrites slide
    // bullets into "complete, connected sentences", so line breaks are gone
    // by the time the text is rendered. A line-based detector alone found
    // nothing at all in production.
    const chunked =
      "Permanent (‘hard’) magnetic materials (e.g. Steel): A permanent magnet keeps its magnetic properties for long time. " +
      "Are hard to magnetise. Do not easily lose their magnetism. E.g. bar magnet, lodestone, earth. " +
      "Temporary (‘soft’) magnetic materials (e.g. Iron): A temporary magnet keeps its magnetic properties for short time. " +
      "Are easy to magnetise. Easily lose their magnetism. E.g. electromagnet.";

    const c = detectComparison(chunked);
    expect(c).not.toBeNull();
    expect(c!.left.title).toContain("Permanent");
    expect(c!.right.title).toContain("Temporary");
    expect(c!.left.points).toHaveLength(4);
    expect(c!.right.points).toHaveLength(4);
    // "E.g. bar magnet, lodestone, earth." must survive as one point rather
    // than splitting after "E.g."
    expect(c!.left.points[3]).toBe("E.g. bar magnet, lodestone, earth.");
  });

  it("declines a single labelled group", () => {
    expect(
      detectComparison("Magnetic materials:\nIron is magnetic.\nNickel is magnetic.\nCobalt is magnetic."),
    ).toBeNull();
  });

  it("declines three groups, which are a taxonomy rather than a contrast", () => {
    expect(
      detectComparison(["A:", "one", "B:", "two", "C:", "three"].join("\n")),
    ).toBeNull();
  });

  it("declines lopsided groups, which are usually a mis-detection", () => {
    const lopsided = ["Lead in", "First:", "a", "b", "c", "d", "e", "Second:", "f"].join("\n");
    expect(detectComparison(lopsided)).toBeNull();
  });

  it("declines ordinary prose containing a colon", () => {
    expect(detectComparison("Note: magnets attract iron.\nThey also attract nickel.")).toBeNull();
  });
});

describe("detectRelationship", () => {
  it("reads the proportionality a syllabus states", () => {
    const r = detectRelationship("Greater the distance from the wire, weaker is the magnetic field.");
    expect(r).not.toBeNull();
    expect(r!.cause).toMatch(/distance from the wire/i);
    expect(r!.effect).toMatch(/magnetic field/i);
  });

  it("handles the 'closer/greater' phrasing too", () => {
    const r = detectRelationship("Closer the poles, greater is the force.");
    expect(r!.cause).toMatch(/poles/i);
    expect(r!.effect).toMatch(/force/i);
  });

  it("declines a sentence with only one comparative", () => {
    expect(detectRelationship("A greater force produces a turning effect.")).toBeNull();
  });
});

describe("detectFormula", () => {
  it("pulls out a named formula", () => {
    const f = detectFormula("Moment = force × perpendicular distance from the pivot");
    expect(f).not.toBeNull();
    expect(f!.result).toBe("Moment");
    expect(f!.expression).toContain("force");
  });

  it("ignores a worked calculation, which is an answer rather than a rule", () => {
    // The distance-time deck's speed column is full of these.
    expect(detectFormula("(10-0)/(1-0) = 10m/s")).toBeNull();
  });

  it("ignores an equals sign with no operator", () => {
    expect(detectFormula("Speed = 10")).toBeNull();
  });
});
