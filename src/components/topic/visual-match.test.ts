import { describe, expect, it } from "vitest";
import { assignVisuals, visualFor } from "./visuals/ConceptVisual";

// A visual is a claim. Matching the wrong one to a section teaches something
// the teacher never approved, so these tests pin both directions: the
// concepts that must match, and the near-misses that must not.
describe("visualFor", () => {
  it("matches the concepts a magnetism deck actually covers", () => {
    expect(
      visualFor("Domains in magnetic materials", "These domains are pointing in different directions until magnetised."),
    ).toBe("domains");
    expect(
      visualFor("Magnet poles in broken pieces", "Each piece of broken magnet still has a north and south pole."),
    ).toBe("broken");
    expect(
      visualFor("How an electromagnet is made", "An electromagnet is formed by passing a current through a coil."),
    ).toBe("electromagnet");
    expect(visualFor("Effect of distance on magnetic force", "Closer the poles, greater is the force.")).toBe(
      "distance",
    );
    expect(
      visualFor("Magnetic field around a bar magnet", "The region around a magnet where materials experience a force."),
    ).toBe("field");
  });

  // The three sections that were served the wrong diagram in production.
  describe("regressions from the first release", () => {
    it("gives the thumb rule a straight conductor, not a bar magnet", () => {
      expect(
        visualFor(
          "Maxwell's Right Hand Thumb Rule and factors affecting magnetic field strength",
          "If you grip a current carrying conductor so the thumb points in the direction of the current, the fingers point in the direction of the magnetic field. Greater the distance from the wire, weaker is the magnetic field.",
        ),
      ).toBe("conductor");
    });

    it("gives the solenoid grip rule its own visual", () => {
      expect(
        visualFor(
          "Right-hand grip rule for a solenoid",
          "Wrap your right hand around the solenoid with your fingers in the direction of the conventional current; your thumb points to the magnetic north pole.",
        ),
      ).toBe("grip");
    });

    it("gives a section about wire insulation nothing at all", () => {
      expect(
        visualFor(
          "Why insulation is used in a solenoid",
          "Insulated copper wire is used because without insulation the current gets short circuited. Copper has low resistance.",
        ),
      ).toBeNull();
    });
  });

  it("gives no visual to sections it cannot place", () => {
    expect(visualFor("Early history of magnetism", "Thales of Miletus investigated magnetism around 625 BC.")).toBeNull();
    expect(visualFor("Learning goals for magnetism", "To explain the differences between materials.")).toBeNull();
    expect(visualFor("Magnetic stripe on a credit card", "The stripe is made of tiny iron particles.")).toBeNull();
  });

  it("requires a corroborating term, not just the concept word", () => {
    expect(visualFor("Domains in magnetic materials", "Named after the physicist who first described them.")).toBeNull();
  });
});

describe("assignVisuals", () => {
  it("gives a concept its interactive once, however often the deck returns to it", () => {
    const kinds = assignVisuals([
      { heading: "How an electromagnet is made", text: "A current through a coil makes it magnetic.", hasMedia: false },
      { heading: "How a solenoid produces a magnetic field", text: "A direct current flows through it.", hasMedia: false },
      {
        heading: "Why an electromagnet beats a permanent magnet in a scrapyard",
        text: "It can be switched on and off to release a car body.",
        hasMedia: false,
      },
    ]);
    expect(kinds).toEqual(["electromagnet", null, null]);
  });

  it("spends a concept's interactive on the section without a real diagram", () => {
    const kinds = assignVisuals([
      { heading: "Domains in magnetic materials", text: "They line up once magnetised.", hasMedia: true },
      { heading: "More about domains", text: "The domains align in the same direction.", hasMedia: false },
    ]);
    // The first already has the teacher's own picture, so the interactive is
    // better spent on the section that has nothing.
    expect(kinds).toEqual([null, "domains"]);
  });

  it("still gives an illustrated section its interactive when nothing else claims it", () => {
    // A diagram and something you can turn in your hands do different jobs.
    // Treating them as mutually exclusive denied interaction to exactly the
    // best-illustrated sections.
    const kinds = assignVisuals([
      { heading: "Magnetic field around a bar magnet", text: "The region around a magnet where a pole feels force.", hasMedia: true },
    ]);
    expect(kinds).toEqual(["field"]);
  });
});
