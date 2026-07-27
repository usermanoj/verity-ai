import { describe, expect, it } from "vitest";
import { visualFor } from "./visuals/ConceptVisual";

// A visual is a claim. Matching the wrong one to a section would teach
// something the teacher never approved, so these tests pin both directions:
// the concepts that must match, and the near-misses that must not.
describe("visualFor", () => {
  it("matches the concepts a magnetism deck actually covers", () => {
    expect(
      visualFor("Domains in magnetic materials", "These domains are pointing in different directions until magnetised."),
    ).toBe("domains");
    expect(
      visualFor("Magnet poles in broken pieces", "Each piece of broken magnet still has a north and south pole."),
    ).toBe("broken");
    expect(
      visualFor("Electromagnets: making and controlling them", "A current through the coil can be switched on and off."),
    ).toBe("electromagnet");
    expect(visualFor("Effect of distance on magnetic force", "Closer the poles, greater is the force.")).toBe(
      "distance",
    );
    expect(
      visualFor("Magnetic field around a bar magnet", "The region around a magnet where materials experience a force."),
    ).toBe("field");
  });

  it("gives no visual to sections it cannot place", () => {
    expect(visualFor("Early history of magnetism", "Thales of Miletus investigated magnetism around 625 BC.")).toBeNull();
    expect(visualFor("Learning goals for magnetism", "To explain the differences between materials.")).toBeNull();
    expect(visualFor("Magnetic stripe on a credit card", "The stripe is made of tiny iron particles.")).toBeNull();
  });

  it("requires a corroborating term, not just the concept word", () => {
    // A heading can name a concept while the section is about something else.
    // Half a match must yield nothing rather than an approximate diagram.
    expect(visualFor("Domains in magnetic materials", "Named after the physicist who first described them.")).toBeNull();
    expect(visualFor("Distance learning and magnets", "A note about the syllabus.")).toBeNull();
  });
});
