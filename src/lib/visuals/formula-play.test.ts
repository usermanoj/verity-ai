import { describe, expect, it } from "vitest";
import { compute, parseFormula, shortLabel, workingOut } from "./formula-play";

// The claim this file has to earn is that it carries no subject knowledge.
// Every formula below comes from a different subject, and none of them is
// written down anywhere in the source — they are read out of a sentence.

describe("parseFormula, across subjects", () => {
  const cases: [string, string, string[], string][] = [
    // Verbatim from this school's moments deck, which the existing
    // line-anchored detector has never matched.
    [
      "Moment = force x perpendicular distance from the turning point. Where force is in newtons (N)",
      "Moment",
      ["force", "perpendicular distance from the turning point"],
      "×",
    ],
    ["Speed = distance / time", "Speed", ["distance", "time"], "÷"],
    ["Density = mass / volume", "Density", ["mass", "volume"], "÷"],
    ["Concentration = moles / volume of solution", "Concentration", ["moles", "volume of solution"], "÷"],
    // Lead-in prose before the quantity, which is how a sentence usually
    // arrives at one. Without stripping it the slider is labelled "For any
    // rectangle, Area".
    ["For any rectangle, Area = length x width.", "Area", ["length", "width"], "×"],
    ["Ohm's law states that Voltage = current × resistance", "Voltage", ["current", "resistance"], "×"],
    ["Under a microscope, Magnification = image size / actual size", "Magnification", ["image size", "actual size"], "÷"],
    // Symbolic, which teachers write as often as they write the words.
    ["M = F x d", "M", ["F", "d"], "×"],
  ];

  for (const [text, result, operands, operator] of cases) {
    it(`reads ${result} = ${operands.join(` ${operator} `)}`, () => {
      const f = parseFormula(text);
      expect(f).not.toBeNull();
      expect(f!.result).toBe(result);
      expect(f!.operands).toEqual(operands);
      expect(f!.operator).toBe(operator);
    });
  }
});

describe("parseFormula refuses what it should", () => {
  it("will not play with a worked example", () => {
    // The same deck, often the same section. Sliders on this are nonsense —
    // the numbers ARE the point of it.
    expect(parseFormula("Turning effect = 2m x 4N = 8 Nm, clockwise")).toBeNull();
    expect(parseFormula("Net moment = (0.8m x 2N) + (2m x 2N)= 5.6 Nm")).toBeNull();
  });

  it("stops at the end of the definition", () => {
    // "M = F x d F = M / d" is two statements run together by extraction.
    const f = parseFormula("M = F x d F = M / d M = 42 Nm ; d = 7cm = 0.07m");
    expect(f?.operands).toEqual(["F", "d"]);
  });

  it("ignores a sentence that merely contains an equals sign", () => {
    expect(
      parseFormula(
        "The Principle of Moments states that when a body is balanced, the total clockwise moment about a fixed point equals the total anticlockwise moment = something",
      ),
    ).toBeNull();
  });

  it("needs an operator, not just an equals sign", () => {
    expect(parseFormula("Speed = velocity")).toBeNull();
    expect(parseFormula("answer = 12")).toBeNull();
  });

  it("has nothing to say about ordinary prose", () => {
    expect(parseFormula("Magnetic forces are non-contact forces.")).toBeNull();
    expect(parseFormula("")).toBeNull();
  });

  it("refuses a formula with a number in it", () => {
    // A subscripted one — "Slope = y2-y1 / x2-x1" — is a real formula and a
    // deliberate loss: reading it wrongly would put a false relationship in a
    // teacher's own lesson, and the gradient interactive covers that section.
    expect(parseFormula("Slope = y2-y1 / x2-x1")).toBeNull();
  });
});

describe("compute", () => {
  const moment = parseFormula("Moment = force x perpendicular distance")!;
  const speed = parseFormula("Speed = distance / time")!;

  it("multiplies", () => {
    expect(compute(moment, [4, 3])).toBe(12);
  });

  it("divides", () => {
    expect(compute(speed, [10, 4])).toBe(2.5);
  });

  it("refuses to divide by zero rather than printing Infinity", () => {
    // A student who drags time to zero must not be taught that the answer is
    // a number.
    expect(compute(speed, [10, 0])).toBeNull();
  });
});

describe("workingOut", () => {
  it("shows the substitution, not just the answer", () => {
    // Watching the rule being used is what the section is teaching.
    const f = parseFormula("Moment = force x perpendicular distance")!;
    expect(workingOut(f, [4, 3])).toBe("Moment = 4 × 3 = 12");
  });

  it("does not print a wall of decimals", () => {
    const f = parseFormula("Speed = distance / time")!;
    expect(workingOut(f, [10, 3])).toBe("Speed = 10 ÷ 3 = 3.33");
  });

  it("has nothing to show when the answer is undefined", () => {
    const f = parseFormula("Speed = distance / time")!;
    expect(workingOut(f, [10, 0])).toBeNull();
  });
});

describe("shortLabel", () => {
  it("leaves a short name alone", () => {
    expect(shortLabel("force")).toBe("force");
  });

  it("cuts at a word, never mid-word", () => {
    // "perpendicular distance from the tu" would be worse than useless. What
    // is kept has to be a whole prefix of the original, ending where a word
    // ends — checked against the original rather than by eye.
    const full = "perpendicular distance from the turning point";
    const out = shortLabel(full);
    expect(out.endsWith("…")).toBe(true);
    const kept = out.slice(0, -1);
    expect(full.startsWith(kept)).toBe(true);
    expect(full[kept.length] === " " || full.length === kept.length).toBe(true);
    expect(out.length).toBeLessThanOrEqual(24);
  });
});

describe("names a quantity, not the sentence that introduces it", () => {
  it("keeps a multi-word quantity whole", () => {
    // "Net moment" and "Turning effect" are real names; a one-word rule would
    // truncate them.
    expect(parseFormula("Net moment = clockwise force x distance")?.result).toBe("Net moment");
  });

  it("stops at a word doing grammar rather than naming", () => {
    expect(parseFormula("The rule shows that Pressure = force / area")?.result).toBe("Pressure");
  });

  it("drops a full stop that ended the sentence, not the quantity", () => {
    expect(parseFormula("For any rectangle, Area = length x width.")?.operands).toEqual(["length", "width"]);
  });
});
