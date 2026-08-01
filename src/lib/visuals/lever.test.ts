import { describe, expect, it } from "vitest";
import { balancingForce, leverState, nm, BALANCE_TOLERANCE, MAX_TILT } from "./lever";

// The numbers below come from the teacher's own worked example:
//
//   200 N × 1.5 m = F × 1.0 m   →   F = 300 N
//
// A visual that draws well and computes a moment wrongly is worse than no
// visual. A student trusts the thing they can drag, and nothing else on the
// page contradicts it.

describe("leverState — the teacher's worked example", () => {
  it("computes both moments from force × distance", () => {
    const s = leverState({ force: 200, distance: 1.5 }, { force: 300, distance: 1.0 });
    expect(s.anticlockwise).toBe(300);
    expect(s.clockwise).toBe(300);
    expect(s.balanced).toBe(true);
  });

  it("knows the beam is unbalanced when the moments differ", () => {
    const s = leverState({ force: 200, distance: 1.5 }, { force: 100, distance: 1.0 });
    expect(s.anticlockwise).toBe(300);
    expect(s.clockwise).toBe(100);
    expect(s.net).toBe(-200);
    expect(s.balanced).toBe(false);
  });

  it("tips towards the bigger moment, not the bigger force", () => {
    // The whole point of the topic. A small force far out beats a large force
    // close in, and a visual that tipped towards the heavier mass would teach
    // the misconception the lesson exists to correct.
    const s = leverState({ force: 10, distance: 4 }, { force: 30, distance: 1 });
    expect(s.anticlockwise).toBe(40);
    expect(s.clockwise).toBe(30);
    expect(s.tiltDeg).toBeLessThan(0); // anticlockwise, i.e. left side down
  });

  it("treats a force at the pivot as having no turning effect", () => {
    const s = leverState({ force: 500, distance: 0 }, { force: 1, distance: 1 });
    expect(s.anticlockwise).toBe(0);
    expect(s.clockwise).toBe(1);
  });

  it("calls a floating-point near-miss balanced", () => {
    // 0.1 × 3 is not exactly 0.3. A student who has just balanced the beam
    // correctly must not be told they have not.
    const s = leverState({ force: 0.1, distance: 3 }, { force: 0.3, distance: 1 });
    expect(Math.abs(s.net)).toBeLessThan(BALANCE_TOLERANCE);
    expect(s.balanced).toBe(true);
  });
});

describe("leverState — the drawing", () => {
  it("keeps the beam level when balanced", () => {
    expect(leverState({ force: 5, distance: 2 }, { force: 2, distance: 5 }).tiltDeg).toBe(0);
  });

  it("never tilts past the point where a real beam hits the ground", () => {
    const extreme = leverState({ force: 0, distance: 0 }, { force: 10000, distance: 10 });
    expect(extreme.tiltDeg).toBeLessThanOrEqual(MAX_TILT);
    expect(extreme.tiltDeg).toBeGreaterThanOrEqual(-MAX_TILT);
  });

  it("responds visibly at small forces as well as large ones", () => {
    // Scaled against the larger moment rather than an absolute range, so a
    // beam with 2 N on it moves as much as one with 2000 N.
    const small = leverState({ force: 1, distance: 1 }, { force: 2, distance: 1 });
    const large = leverState({ force: 1000, distance: 1 }, { force: 2000, distance: 1 });
    expect(small.tiltDeg).toBeCloseTo(large.tiltDeg, 5);
  });

  it("produces a finite tilt when nothing is on the beam", () => {
    // An empty beam divides by zero if the scale is not guarded, and NaN in a
    // transform renders as an invisible component with no error anywhere.
    const empty = leverState({ force: 0, distance: 0 }, { force: 0, distance: 0 });
    expect(Number.isFinite(empty.tiltDeg)).toBe(true);
    expect(empty.tiltDeg).toBe(0);
  });
});

describe("balancingForce", () => {
  it("answers the question every worked example asks", () => {
    // "200 N at 1.5 m — what force at 1.0 m balances it?"
    expect(balancingForce({ force: 200, distance: 1.5 }, 1.0)).toBe(300);
  });

  it("halves the force when the distance doubles", () => {
    expect(balancingForce({ force: 100, distance: 2 }, 4)).toBe(50);
  });

  it("refuses to answer at the pivot rather than dividing by zero", () => {
    // No force applied at the turning point can balance anything. A number
    // here would be arithmetic presented as physics.
    expect(balancingForce({ force: 200, distance: 1.5 }, 0)).toBeNull();
  });
});

describe("nm", () => {
  it("writes a moment the way a Grade 7 answer is written", () => {
    expect(nm(300)).toBe("300 Nm");
    expect(nm(7.5)).toBe("7.5 Nm");
    expect(nm(7.04)).toBe("7 Nm");
    expect(nm(0)).toBe("0 Nm");
  });
});
