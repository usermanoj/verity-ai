import { describe, expect, it } from "vitest";
import { meaning, slope, workings, type Point } from "./gradient";

// The worked example on the teacher's own slide, which this has to reproduce
// exactly — a student checking the widget against their exercise book is the
// whole point, and a discrepancy would make them doubt the book.
const A: Point = { t: 1, d: 50 };
const B: Point = { t: 3, d: 150 };

describe("slope", () => {
  it("gives the speed from the deck's worked example", () => {
    expect(slope(A, B)).toBe(50);
  });

  it("is null when there is no run", () => {
    // Two readings at the same instant do not describe a speed. Infinity would
    // print as a number and teach that they do.
    expect(slope({ t: 2, d: 0 }, { t: 2, d: 10 })).toBeNull();
  });

  it("is zero while an object is stationary", () => {
    expect(slope({ t: 0, d: 5 }, { t: 10, d: 5 })).toBe(0);
  });

  it("is negative on the way back", () => {
    expect(slope({ t: 0, d: 10 }, { t: 5, d: 0 })).toBe(-2);
  });
});

describe("workings", () => {
  it("shows the subtraction, not just the answer", () => {
    // The section is a worked example. A widget that printed "50 m/s" alone
    // would skip the step the lesson is teaching.
    expect(workings(A, B)).toBe("(150 − 50) m ÷ (3 − 1) s = 100 ÷ 2 = 50 m/s");
  });

  it("reads the same whichever point was dragged", () => {
    // On these graphs the two points are readings, not a direction, so a
    // student who drags B left of A should not be told the speed is negative.
    expect(workings(B, A)).toBe(workings(A, B));
  });

  it("has nothing to show when there is no run", () => {
    expect(workings({ t: 2, d: 0 }, { t: 2, d: 9 })).toBeNull();
  });

  it("does not print a wall of decimals", () => {
    const out = workings({ t: 0, d: 0 }, { t: 3, d: 10 })!;
    expect(out).toContain("3.33 m/s");
  });
});

describe("meaning", () => {
  // The deck asks students to explain what a horizontal line, an upward
  // sloping line and a curve mean. These are those answers and no others.
  it("names a horizontal line as not moving", () => {
    expect(meaning({ t: 0, d: 5 }, { t: 4, d: 5 })).toContain("not moving");
  });

  it("names an upward slope as moving away", () => {
    expect(meaning(A, B)).toContain("moving away");
  });

  it("names a downward slope as coming back", () => {
    expect(meaning({ t: 0, d: 10 }, { t: 5, d: 2 })).toContain("coming back");
  });

  it("treats a hair's-breadth slope as flat", () => {
    // Dragged points are never exact. Without a tolerance a student who meant
    // to draw a flat line would be told the object is moving.
    expect(meaning({ t: 0, d: 5 }, { t: 1000, d: 5.0001 })).toContain("not moving");
  });
});
