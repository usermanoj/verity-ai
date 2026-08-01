// The physics of a beam on a pivot.
//
// Pure and tested, and kept out of the component, because this is the thing the
// lesson is teaching. A visual that renders beautifully and computes a moment
// wrongly is worse than no visual: a student who trusts it learns the wrong
// rule, and nothing on the page contradicts it.
//
// Everything here is the definition from the teacher's own section 1:
//
//   Moment = force × perpendicular distance from the turning point
//   Force in newtons (N), distance in metres (m), moment in newton metres (Nm)

export type Side = { force: number; distance: number };

export type LeverState = {
  /** Force × distance on the right of the pivot, in Nm. */
  clockwise: number;
  /** Force × distance on the left of the pivot, in Nm. */
  anticlockwise: number;
  /** Positive tips clockwise, negative anticlockwise. */
  net: number;
  balanced: boolean;
  /** Degrees, positive clockwise, for drawing the beam. */
  tiltDeg: number;
};

/** Beyond this the beam has hit the ground; a real see-saw does not keep turning. */
export const MAX_TILT = 14;

/**
 * Balanced within a whisker, not exactly.
 *
 * Floating point makes 200 × 1.5 and 300 × 1.0 differ in the fifteenth decimal
 * place. A student who has just balanced a beam correctly must not be told they
 * have not.
 */
export const BALANCE_TOLERANCE = 0.001;

export function leverState(left: Side, right: Side): LeverState {
  const anticlockwise = left.force * left.distance;
  const clockwise = right.force * right.distance;
  const net = clockwise - anticlockwise;

  // Tilt is proportional to the net moment but capped, and scaled against the
  // larger of the two so the beam responds visibly at small forces as well as
  // large ones. This is a drawing decision, not physics — a real beam's angle
  // depends on the load's geometry, and pretending otherwise would be teaching
  // something untrue about acceleration.
  const scale = Math.max(clockwise, anticlockwise, 1);
  const tiltDeg = Math.max(-MAX_TILT, Math.min(MAX_TILT, (net / scale) * MAX_TILT));

  return {
    clockwise,
    anticlockwise,
    net,
    balanced: Math.abs(net) < BALANCE_TOLERANCE,
    tiltDeg,
  };
}

/**
 * The force that would balance the beam, given the other side.
 *
 * The question every worked example in this topic asks — "what must F be?" —
 * and the answer the student should be able to check themselves.
 *
 * Null when the distance is zero: a force applied at the pivot has no turning
 * effect at all, so no value of it can balance anything. Returning a number
 * there would be dividing by zero and calling the result physics.
 */
export function balancingForce(known: Side, atDistance: number): number | null {
  if (atDistance === 0) return null;
  return (known.force * known.distance) / atDistance;
}

/** One decimal place, and no trailing ".0" — how a Grade 7 answer is written. */
export function nm(value: number): string {
  return `${Number(value.toFixed(1))} Nm`;
}
