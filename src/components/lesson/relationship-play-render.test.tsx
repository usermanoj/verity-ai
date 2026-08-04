import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RelationshipPlay from "./RelationshipPlay";

// The direction is tested next door. This pins what a test of the arithmetic
// cannot: that a section with no relationship renders nothing, that the
// teacher's own sentence is on screen, and above all that no number appears —
// the source states which way, never how much.

const render = (text: string) => renderToStaticMarkup(<RelationshipPlay text={text} />);

describe("RelationshipPlay", () => {
  it("renders nothing without a relationship", () => {
    expect(render("Magnets attract iron.")).toBe("");
    expect(render("")).toBe("");
  });

  it("shows the teacher's sentence", () => {
    // Verbatim from the magnets deck.
    const html = render("Closer the poles, greater is the force.");
    expect(html).toContain("Closer the poles, greater is the force.");
  });

  it("names both ends of the quantity so it can be read either way", () => {
    const html = render("Closer the poles, greater is the force.");
    expect(html).toContain("closer");
    expect(html).toContain("further");
  });

  it("says which way the pair moves", () => {
    expect(render("Closer the poles, greater is the force.")).toContain("One goes up as the other goes down");
    expect(render("Higher the temperature, faster is the reaction.")).toContain("rise and fall together");
  });

  it("puts no quantity on screen", () => {
    // The whole discipline of this widget. "Closer means stronger" does not
    // say by how much, so a scale, an axis or a percentage would each be an
    // invention sitting inside a teacher's own lesson.
    const html = render("Closer the poles, greater is the force.");
    const visible = html.replace(/<[^>]*>/g, " ");
    expect(visible).not.toMatch(/\d/);
  });

  it("tells a screen reader the same thing, in the same words", () => {
    // The first version stripped tags to check for numbers, so it passed while
    // the aria-label read "50 per cent of the way along" — a precise figure
    // handed to a blind student and to nobody else. The discipline has to hold
    // for both or it is not one.
    const html = render("Closer the poles, greater is the force.");
    for (const label of html.match(/aria-label="[^"]*"/g) ?? []) {
      expect(label, `a number reached a screen reader: ${label}`).not.toMatch(/\d/);
    }
    expect(html).toContain('aria-label="force: greater"');
  });

  it("carries no subject knowledge", () => {
    // Chemistry and biology, on a component written for neither.
    expect(render("Higher the concentration, faster the rate.")).toContain("rise and fall together");
    expect(render("More the light, taller the plant.")).toContain("taller");
    expect(render("Greater the mass, slower the acceleration.")).toContain("One goes up as the other goes down");
  });

  it("is described for a screen reader without inventing a value", () => {
    const html = render("Closer the poles, greater is the force.");
    expect(html).toContain('role="img"');
    expect(html).toContain("aria-label");
  });
});
