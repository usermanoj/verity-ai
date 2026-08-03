import { describe, expect, it } from "vitest";
import { assignVisuals, visualFor } from "@/lib/visuals/catalogue";

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

// The lever, added when a real Moments deck rendered nothing but slide images.
// Its `unless` guard carries more weight than any other in the list: a compass
// needle in a field genuinely experiences a turning effect, and "magnetic
// moment" is a real term — either would have put a see-saw in the middle of a
// magnetism lesson.
describe("visualFor — the lever", () => {
  it("matches the headings a Moments deck actually uses", () => {
    // All four verbatim from the uploaded Grade 7 deck.
    expect(
      visualFor("Moment formula and units", "Moment = force x perpendicular distance from the turning point."),
    ).toBe("lever");
    expect(visualFor("Principle of moments", "The clockwise moment equals the anticlockwise moment about the pivot.")).toBe(
      "lever",
    );
    expect(visualFor("Checking whether beams are in equilibrium", "Compare the clockwise and anticlockwise moments.")).toBe(
      "lever",
    );
    expect(visualFor("Definition of a moment", "The turning effect of a force depends on the force and the distance.")).toBe(
      "lever",
    );
  });

  it("does not put a see-saw in a magnetism lesson", () => {
    // A compass needle turning in a field is a turning effect, and this is the
    // sentence that would have matched.
    expect(
      visualFor("Turning effect on a compass needle", "The needle feels a turning effect from the magnetic field."),
    ).not.toBe("lever");
    expect(visualFor("Magnetic moment of a dipole", "The magnetic moment depends on the current and the area.")).not.toBe(
      "lever",
    );
    expect(visualFor("Force on a current-carrying conductor", "The force depends on the current and the field.")).not.toBe(
      "lever",
    );
  });

  it("needs more than the word alone", () => {
    // "For a moment, consider..." is English, not physics.
    expect(visualFor("A moment in history", "Lodestones were described a long time ago.")).not.toBe("lever");
  });

  it("gives the lever to one section, not to all eight", () => {
    // A concept earns its interactive once. Eight see-saws in one lesson reads
    // as automation rather than authorship.
    const sections = [
      { heading: "Moment formula and units", text: "Moment = force x distance from the pivot.", hasMedia: false },
      { heading: "Principle of moments", text: "Clockwise moment equals anticlockwise moment about the pivot.", hasMedia: false },
      { heading: "Net moment examples", text: "Work out the resultant turning effect of two forces.", hasMedia: false },
    ];
    expect(assignVisuals(sections).filter((k) => k === "lever")).toHaveLength(1);
  });
});

describe("the motion deck, verbatim", () => {
  // Every heading and opening line below is copied from the school's real
  // "4-Distance time graph.pptx". Before these rules existed the whole deck
  // matched nothing: fourteen sections, no interactive, and the AI pass could
  // not help because the library had nothing about motion in it.
  const DECK: { heading: string; text: string }[] = [
    {
      heading: "Steady speed and reference points",
      text: "Two passengers are sitting in a compartment of a moving train. Are they in motion with respect to each other? If a car covers a distance of 6m every second, is it in uniform or non-uniform motion?",
    },
    {
      heading: "Graph of an object not moving",
      text: "Your graph will look like this. The distance time graph of an object which is not moving is a horizontal line parallel to X-axis.",
    },
    {
      heading: "Sketching a journey with pauses",
      text: "I walked 5 m in 10 seconds, stopped for 10 seconds, then walked 5 m in 5 seconds. Sketch a distance- time graph to represent the journey.",
    },
    {
      heading: "Gradient and speed",
      text: "Slope or gradient of the distance time graph gives you speed.",
    },
    {
      heading: "Worked example: gradient equals speed",
      text: "Calculate the slope or gradient of this distance time graph between the points A and B. Slope = y2-y1 / x2-x1 = (150 -50)m / (3-1)s = 100/2 = 50 m/s",
    },
  ];

  it("gives the gradient interactive to the section that works it out", () => {
    expect(visualFor(DECK[4].heading, DECK[4].text)).toBe("gradient");
    expect(visualFor(DECK[3].heading, DECK[3].text)).toBe("gradient");
  });

  it("gives the journey graph to the section that sketches one", () => {
    expect(visualFor(DECK[2].heading, DECK[2].text)).toBe("journey");
  });

  it("illustrates the deck that used to get nothing at all", () => {
    // The measure that matters: this deck scored zero before.
    const assigned = assignVisuals(DECK.map((s) => ({ ...s, hasMedia: false })));
    expect(assigned.filter(Boolean).length).toBeGreaterThanOrEqual(2);
  });

  it("still gives each interactive to only one section", () => {
    const assigned = assignVisuals(DECK.map((s) => ({ ...s, hasMedia: false }))).filter(Boolean);
    expect(new Set(assigned).size).toBe(assigned.length);
  });
});

describe("the two families do not poach each other", () => {
  it("keeps the magnetism force-distance section away from the motion rules", () => {
    // "It is an example of a force acting at a distance" — the word distance
    // in a magnetism deck must not summon a distance-time graph.
    expect(
      visualFor(
        "Magnetic forces as non-contact forces",
        "Magnetic forces are non-contact forces – this means that magnets affect each other without touching. It is an example of a force acting at a distance.",
      ),
    ).not.toBe("journey");
  });

  it("keeps a magnetic moment away from the motion rules", () => {
    expect(visualFor("Magnetic moment", "The magnetic moment of a compass needle in a field.")).not.toBe("gradient");
  });

  it("does not put a see-saw on a section about steady speed", () => {
    // The failure the model made twice, checked against the matcher too.
    expect(visualFor("Steady speed of 10m/s", "Steady speed of 10m/s means, that the car travels a distance of 10m every second.")).not.toBe("lever");
  });
});
