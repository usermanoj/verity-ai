import { describe, it, expect } from "vitest";
import { grade, gradeNumeric, gradeMcq, gradeTrueFalse, gradeFill, gradeMatching, parseNumber } from "./grade";

describe("parseNumber", () => {
  it("extracts value from messy answers", () => {
    expect(parseNumber("= 300 Nm")).toBe(300);
    expect(parseNumber("Moment is 28 Nm clockwise")).toBe(28);
    expect(parseNumber("600N")).toBe(600);
    expect(parseNumber("no number here")).toBeNull();
    expect(parseNumber("2.4 Nm")).toBe(2.4);
  });
});

describe("gradeNumeric — seesaw / lever", () => {
  const q = { kind: "numeric", expected: 28, unit: "Nm", direction: "clockwise" } as const;

  it("accepts exact correct answer", () => {
    const r = gradeNumeric(q, "28 Nm clockwise");
    expect(r.correct).toBe(true);
    expect(r.score).toBe(1);
  });

  it("accepts newton metre spelled out", () => {
    const r = gradeNumeric(q, "28 newton metres clockwise");
    expect(r.correct).toBe(true);
  });

  it("rejects wrong number outright (no reward for guessing)", () => {
    const r = gradeNumeric(q, "30 Nm clockwise");
    expect(r.correct).toBe(false);
    expect(r.score).toBe(0);
  });

  it("flags missing/wrong direction but right value", () => {
    const r = gradeNumeric(q, "28 Nm anticlockwise");
    expect(r.correct).toBe(false);
    expect(r.details.valueOk).toBe(true);
    expect(r.details.directionOk).toBe(false);
    expect(r.feedback).toMatch(/direction/i);
  });

  it("flags wrong unit but right value", () => {
    const r = gradeNumeric(q, "28 N clockwise");
    expect(r.details.valueOk).toBe(true);
    expect(r.details.unitOk).toBe(false);
  });

  it("respects tolerance", () => {
    const qt = { kind: "numeric", expected: 600, unit: "N", tolerance: 5 } as const;
    expect(gradeNumeric(qt, "601 N").correct).toBe(true);
    expect(gradeNumeric(qt, "610 N").correct).toBe(false);
  });
});

describe("gradeMcq", () => {
  const q = { kind: "mcq", correct: "C" } as const;
  it("matches regardless of punctuation/case", () => {
    expect(gradeMcq(q, "c").correct).toBe(true);
    expect(gradeMcq(q, "C)").correct).toBe(true);
    expect(gradeMcq(q, " C. ").correct).toBe(true);
    expect(gradeMcq(q, "A").correct).toBe(false);
  });
});

describe("gradeMcq — with options", () => {
  const q = {
    kind: "mcq",
    correct: "B",
    options: ["Copper", "Iron", "Plastic"],
  } as const;

  it("accepts the letter, the position, or the option's own text", () => {
    expect(gradeMcq(q, "B").correct).toBe(true);
    expect(gradeMcq(q, "2").correct).toBe(true);
    expect(gradeMcq(q, "Iron").correct).toBe(true);
    expect(gradeMcq(q, "iron.").correct).toBe(true);
    expect(gradeMcq(q, "Copper").correct).toBe(false);
  });

  it("names the right answer when wrong, instead of just saying no", () => {
    expect(gradeMcq(q, "A").feedback).toContain("Iron");
  });
});

describe("gradeTrueFalse", () => {
  const q = { kind: "truefalse", correct: true, because: "only two magnets repel." } as const;

  it("accepts the words a student actually types", () => {
    for (const yes of ["True", "true", "T", "yes"]) expect(gradeTrueFalse(q, yes).correct).toBe(true);
    for (const no of ["False", "f", "no"]) expect(gradeTrueFalse(q, no).correct).toBe(false);
  });

  it("explains why, rather than only marking it", () => {
    expect(gradeTrueFalse(q, "True").feedback).toContain("only two magnets repel");
  });

  it("asks again rather than marking gibberish wrong", () => {
    expect(gradeTrueFalse(q, "maybe").feedback).toMatch(/True or False/);
  });
});

describe("gradeFill", () => {
  const q = { kind: "fill", accept: ["magnetised"] } as const;

  it("does not fail an ESL student on case, spacing or punctuation", () => {
    expect(gradeFill(q, "Magnetised").correct).toBe(true);
    expect(gradeFill(q, "  magnetised. ").correct).toBe(true);
  });

  it("accepts the American spelling of a British syllabus word", () => {
    expect(gradeFill(q, "magnetized").correct).toBe(true);
  });

  it("still rejects a different word", () => {
    expect(gradeFill(q, "magnetic").correct).toBe(false);
  });
});

describe("gradeMatching", () => {
  const q = {
    kind: "matching",
    pairs: [
      { left: "Domain", right: "A small magnetic region" },
      { left: "Solenoid", right: "A coil of wire" },
      { left: "Pole", right: "Where the field is strongest" },
    ],
  } as const;

  it("marks a full match correct", () => {
    const answer = q.pairs.map((p, i) => `${i}=${p.right}`).join("\n");
    expect(gradeMatching(q, answer).correct).toBe(true);
  });

  it("still grades an answer keyed by the term, as older ones were", () => {
    const answer = q.pairs.map((p) => `${p.left}=${p.right}`).join("\n");
    expect(gradeMatching(q, answer).correct).toBe(true);
  });

  it("grades repeated terms independently, one row at a time", () => {
    // A real generated question: two terms, four rows, one per property.
    // Keying answers by the term's text made rows 0 and 2 share an answer, so
    // four choices graded as two.
    const repeated = {
      kind: "matching",
      pairs: [
        { left: "Electromagnet", right: "Can be switched on and off" },
        { left: "Permanent magnet", right: "Cannot be turned off" },
        { left: "Electromagnet", right: "Strength can be changed" },
        { left: "Permanent magnet", right: "Strength cannot be varied" },
      ],
    } as const;

    const allRight = repeated.pairs.map((p, i) => `${i}=${p.right}`).join("\n");
    expect(gradeMatching(repeated, allRight).correct).toBe(true);

    // Getting row 2 wrong must cost exactly one mark, not two.
    const oneWrong = repeated.pairs
      .map((p, i) => `${i}=${i === 2 ? "Cannot be turned off" : p.right}`)
      .join("\n");
    const r = gradeMatching(repeated, oneWrong);
    expect(r.score).toBeCloseTo(3 / 4);
  });

  it("gives partial credit, because two of three is not nothing", () => {
    const answer = `Domain=A small magnetic region\nSolenoid=A coil of wire\nPole=A coil of wire`;
    const r = gradeMatching(q, answer);
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(2 / 3);
    expect(r.feedback).toContain("2 of 3");
  });

  it("scores an unanswered question zero without throwing", () => {
    expect(gradeMatching(q, "").score).toBe(0);
  });
});

describe("grade dispatch", () => {
  it("routes every question kind", () => {
    expect(grade({ kind: "numeric", expected: 300, unit: "N" }, "300 N").correct).toBe(true);
    expect(grade({ kind: "mcq", correct: "B" }, "b").correct).toBe(true);
    expect(grade({ kind: "truefalse", correct: false }, "False").correct).toBe(true);
    expect(grade({ kind: "fill", accept: ["iron"] }, "Iron").correct).toBe(true);
    expect(grade({ kind: "matching", pairs: [{ left: "a", right: "b" }] }, "a=b").correct).toBe(true);
  });
});
