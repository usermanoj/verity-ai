import { describe, expect, it } from "vitest";
import { deLatex } from "./delatex";

// The example below is verbatim from a real Grade 7 lesson, in front of a real
// student. Every case here is about a child being shown notation instead of
// physics — and for someone reading in a second language, backslashes are
// indistinguishable from content they have not learned yet.

describe("deLatex — what a student actually saw", () => {
  it("rescues the worked example that prompted this", () => {
    expect(deLatex("Example: \\(200\\,\\text{N} \\times 1.5\\,\\text{m} = F \\times 1.0\\,\\text{m}\\)")).toBe(
      "Example: 200 N × 1.5 m = F × 1.0 m",
    );
  });

  it("rescues the steps beneath it", () => {
    expect(deLatex("Step 1: \\(200 \\times 1.5 = 300\\)")).toBe("Step 1: 200 × 1.5 = 300");
    expect(deLatex("Step 2: \\(300 = F \\times 1.0\\)")).toBe("Step 2: 300 = F × 1.0");
  });

  it("handles display delimiters and dollar signs", () => {
    expect(deLatex("$$E = mc^2$$")).toBe("E = mc^2");
    expect(deLatex("\\[a = b\\]")).toBe("a = b");
  });

  it("unwraps text and unit macros", () => {
    expect(deLatex("\\text{Moment} = 5\\,\\mathrm{Nm}")).toBe("Moment = 5 Nm");
  });

  it("turns a simple fraction into something readable", () => {
    expect(deLatex("speed = \\frac{distance}{time}")).toBe("speed = distance/time");
  });

  it("leaves a nested fraction alone rather than rendering it wrongly", () => {
    // a/b/c would be a different quantity. Ugly maths is recoverable; wrong
    // maths in a physics lesson is not.
    const nested = "\\frac{\\frac{a}{b}}{c}";
    expect(deLatex(nested)).toContain("frac");
  });
});

describe("deLatex — what it must not touch", () => {
  it("returns ordinary prose unchanged, and fast", () => {
    const plain = "A magnet has two poles: north and south. Moment = force × distance.";
    expect(deLatex(plain)).toBe(plain);
  });

  it("leaves Chinese glosses intact", () => {
    // The ESL feature this product exists for.
    const glossed = "The pivot [turning point] 支点 is where it turns.";
    expect(deLatex(glossed)).toBe(glossed);
  });

  it("preserves line structure, which the block renderer depends on", () => {
    // Flattening newlines here produced "1. 1. 1. 1." the last time something
    // touched this text.
    expect(deLatex("- one\n- two\n- three")).toBe("- one\n- two\n- three");
  });

  it("does not eat a lone dollar sign in prose", () => {
    // "$5" is not maths. The first version stripped every dollar and turned
    // this into "It costs 5 to build" — the test title said one thing and the
    // assertion accepted the opposite, which is the more embarrassing of the
    // two bugs. Only PAIRED dollars are delimiters.
    expect(deLatex("It costs $5 to build.")).toBe("It costs $5 to build.");
  });

  it("still unwraps a paired inline dollar", () => {
    expect(deLatex("where $F = ma$ applies")).toBe("where F = ma applies");
  });
});
