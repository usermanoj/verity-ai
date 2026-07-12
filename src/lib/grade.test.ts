import { describe, it, expect } from "vitest";
import { grade, gradeNumeric, gradeMcq, parseNumber } from "./grade";

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

describe("grade dispatch", () => {
  it("routes numeric and mcq", () => {
    expect(grade({ kind: "numeric", expected: 300, unit: "N" }, "300 N").correct).toBe(true);
    expect(grade({ kind: "mcq", correct: "B" }, "b").correct).toBe(true);
  });
});
