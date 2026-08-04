import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { describeMisconception, findMisconceptions } from "@/lib/misconceptions";

// The grouping is tested next door. This pins the two things about how it
// reaches a teacher: that a repeat is stated plainly, and that nothing is said
// at all when there is nothing to say.

const REAL = [0, 5, 10, 15].map((m) => ({
  questionId: "q1",
  prompt: "When you dip a bar magnet in a heap of iron filings, where is the magnetic field strength concentrated?",
  answer: "At the centre",
  correctAnswer: "At the poles",
  at: new Date(Date.UTC(2026, 7, 1, 10, m)).toISOString(),
}));

describe("the stuck-answer finding", () => {
  it("reads as a sentence a teacher can act on", () => {
    const [m] = findMisconceptions(REAL);
    const text = describeMisconception(m);
    expect(renderToStaticMarkup(<p>{text}</p>)).toContain("4 times");
    expect(text).toContain("At the poles");
  });

  it("is silent when nothing repeats", () => {
    // A section that said "no misconceptions found" every time would train a
    // teacher to skip it, and then to skip it on the day it mattered.
    expect(findMisconceptions([REAL[0]])).toEqual([]);
  });
});
