// The slope of a distance-time graph, which is the speed.
//
// Four of the fourteen sections in this school's motion deck are about this one
// idea — "Gradient and speed", "Slope", "Finding the gradient between A and B",
// and a worked example that spells out
//
//   Slope = y2-y1 / x2-x1 = (150 - 50)m / (3 - 1)s = 100/2 = 50 m/s
//
// That is the largest cluster of sections in the whole corpus with nothing to
// show for it. A student asked to "calculate the slope between A and B" from a
// static picture has one worked answer and no way to try another.
//
// Kept pure and separate from the component for the usual reason: this is
// arithmetic a student will check against their own, and it should be tested
// rather than eyeballed on screen.

export type Point = { t: number; d: number };

/**
 * Rise over run, or null when there is no run.
 *
 * Null rather than Infinity: two readings at the same instant do not describe a
 * speed at all, and a graph that printed "Infinity m/s" would be teaching that
 * they do.
 */
export function slope(a: Point, b: Point): number | null {
  const run = b.t - a.t;
  if (run === 0) return null;
  return (b.d - a.d) / run;
}

/**
 * The calculation written the way the teacher's own slide writes it.
 *
 * Deliberately shows the subtraction before the answer. The section being
 * illustrated is a worked example, and a widget that displayed only "50 m/s"
 * would skip the step the lesson is actually teaching.
 *
 * Points are ordered so the run is positive — a student who drags B to the left
 * of A gets the same speed rather than a negative one, because on these graphs
 * the two points are readings, not a direction.
 */
export function workings(a: Point, b: Point): string | null {
  const [first, second] = a.t <= b.t ? [a, b] : [b, a];
  const m = slope(first, second);
  if (m === null) return null;

  const rise = round(second.d - first.d);
  const run = round(second.t - first.t);
  return `(${round(second.d)} − ${round(first.d)}) m ÷ (${round(second.t)} − ${round(first.t)}) s = ${rise} ÷ ${run} = ${round(m)} m/s`;
}

/**
 * What the line between two readings is doing, in the words the deck uses.
 *
 * The deck asks students to "explain what a straight, upward sloping line, a
 * horizontal line and a curved line in a distance-time graph mean", so those
 * are the three answers — no others, and none invented.
 */
export function meaning(a: Point, b: Point): string {
  const m = slope(a, b);
  if (m === null) return "Two readings at the same time — that is not a journey.";
  if (Math.abs(m) < TOLERANCE) return "A horizontal line: the distance is not changing, so the object is not moving.";
  if (m > 0) return "An upward sloping line: the distance is increasing, so the object is moving away.";
  return "A downward sloping line: the distance is decreasing, so the object is coming back.";
}

/** Below this a slope reads as flat. A graph drawn by dragging is never exact. */
export const TOLERANCE = 0.001;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
