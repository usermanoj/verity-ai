import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FormulaPlayground from "./FormulaPlayground";

// The parsing is tested next door. This pins the two things a test of the
// parsing cannot: that a section with no formula renders NOTHING, and that a
// section with one shows the teacher's own sentence above the numbers.

const render = (text: string) => renderToStaticMarkup(<FormulaPlayground text={text} />);

describe("FormulaPlayground", () => {
  it("renders nothing for ordinary prose", () => {
    // Most sections. The same contract TableChart has — a silent absence, not
    // an empty box asking to be filled.
    expect(render("Magnetic forces are non-contact forces.")).toBe("");
    expect(render("")).toBe("");
  });

  it("shows the rule as the teacher wrote it", () => {
    // Verbatim from the school's moments deck.
    const html = render("Moment = force x perpendicular distance from the turning point. Where force is in newtons (N)");
    expect(html).toContain("Moment = force × perpendicular distance from the turning point");
  });

  it("opens on a real sum rather than on zeros", () => {
    const html = render("Moment = force x perpendicular distance");
    expect(html).toContain("Moment = 4 × 4 = 16");
  });

  it("labels a slider per named quantity", () => {
    const html = render("Speed = distance / time");
    expect(html).toContain("distance");
    expect(html).toContain("time");
    expect(html.match(/type="range"/g)).toHaveLength(2);
  });

  it("shortens a long name without hiding which quantity it is", () => {
    const html = render("Moment = force x perpendicular distance from the turning point");
    // The full name survives in the tooltip even when the label is cut.
    expect(html).toContain('title="perpendicular distance from the turning point"');
  });

  it("carries no subject knowledge", () => {
    // The same component, three subjects, nothing about any of them in the
    // source.
    expect(render("Density = mass / volume")).toContain("Density = mass ÷ volume");
    expect(render("Concentration = moles / volume")).toContain("Concentration = moles ÷ volume");
    expect(render("For any rectangle, Area = length x width.")).toContain("Area = length × width");
  });
});
