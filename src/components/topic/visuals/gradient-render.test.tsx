import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GradientGraph from "./GradientGraph";

// The arithmetic is tested next door. This checks the thing a test of the
// arithmetic cannot: that what a student sees on opening the interactive is
// the sum printed on their teacher's slide, rather than some other pair of
// points that would make the widget look like it disagreed with the lesson.

const html = renderToStaticMarkup(<GradientGraph />);

describe("GradientGraph", () => {
  it("opens on the deck's own worked example", () => {
    // Slide: "Slope = y2-y1 / x2-x1 = (150 -50)m / (3-1)s = 100/2 = 50 m/s"
    expect(html).toContain("(150 − 50) m ÷ (3 − 1) s = 100 ÷ 2 = 50 m/s");
  });

  it("says what the line is doing, in the words the deck asks for", () => {
    expect(html).toContain("moving away");
  });

  it("labels both axes with their units", () => {
    // A distance-time graph with unlabelled axes is the mistake the deck
    // spends three sections telling students not to make.
    expect(html).toContain("Distance in m");
    expect(html).toContain("Time in s");
  });

  it("is readable without a mouse", () => {
    expect(html).toContain('role="img"');
    expect(html).toContain("aria-label");
  });
});
