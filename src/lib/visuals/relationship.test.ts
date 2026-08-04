import { describe, expect, it } from "vitest";
import { COMPARATIVES, COMPARATIVE_WORDS, effectAt, readingAt, toPlayable } from "./relationship";
import { detectRelationship } from "@/components/topic/structure";

// Two claims to earn. That the direction is read correctly — an arrow pointing
// the wrong way teaches the opposite of the sentence printed above it — and
// that nothing here knows a subject.

/** Through the real detector, so the parse and the play cannot drift apart. */
const from = (sentence: string) => {
  const found = detectRelationship(sentence);
  expect(found, `detector did not match: ${sentence}`).not.toBeNull();
  return toPlayable(found!.parts);
};

describe("direction, across subjects", () => {
  it("reads an inverse one from this school's magnets deck", () => {
    // "Closer the poles, greater is the force." Closer points down, greater
    // points up: they move against each other.
    const play = from("Closer the poles, greater is the force.")!;
    expect(play.inverse).toBe(true);
    expect(play.cause.thing).toBe("poles");
    expect(play.effect.thing).toBe("force");
  });

  it("reads the other real one, worded the other way round", () => {
    // "Greater the distance from the wire, weaker is the magnetic field."
    // Up then down — still inverse, reached from the opposite side.
    const play = from("Greater the distance from the wire, weaker is the magnetic field.")!;
    expect(play.inverse).toBe(true);
    expect(play.cause.thing).toBe("distance from the wire");
    expect(play.effect.thing).toBe("magnetic field");
  });

  it("reads a direct one", () => {
    const play = from("Higher the temperature, faster is the reaction.")!;
    expect(play.inverse).toBe(false);
  });

  it("works on subjects this school has not uploaded", () => {
    // None of these sentences appears anywhere in the source, and between them
    // they are chemistry, biology and mechanics.
    expect(from("Larger the surface area, quicker the dissolving.")!.inverse).toBe(false);
    expect(from("Higher the concentration, faster the rate.")!.inverse).toBe(false);
    expect(from("More the light, taller the plant.")!.inverse).toBe(false);
    expect(from("Greater the mass, slower the acceleration.")!.inverse).toBe(true);
    expect(from("Thicker the wire, lower the resistance.")!.inverse).toBe(true);
  });

  it("refuses a comparative it does not know rather than guessing", () => {
    // Guessing puts an arrow the wrong way round on a teacher's own lesson.
    expect(
      toPlayable({ causeWord: "spicier", causeThing: "curry", effectWord: "greater", effectThing: "thirst" }),
    ).toBeNull();
  });

  it("refuses an empty half", () => {
    expect(
      toPlayable({ causeWord: "greater", causeThing: "  ", effectWord: "weaker", effectThing: "field" }),
    ).toBeNull();
  });
});

describe("effectAt", () => {
  const inverse = from("Closer the poles, greater is the force.")!;
  const direct = from("Higher the temperature, faster is the reaction.")!;

  it("mirrors an inverse relationship", () => {
    expect(effectAt(inverse, 0)).toBe(1);
    expect(effectAt(inverse, 1)).toBe(0);
    expect(effectAt(inverse, 0.5)).toBe(0.5);
  });

  it("tracks a direct one", () => {
    expect(effectAt(direct, 0)).toBe(0);
    expect(effectAt(direct, 1)).toBe(1);
  });

  it("stays inside the bar however it is called", () => {
    expect(effectAt(direct, 5)).toBe(1);
    expect(effectAt(direct, -3)).toBe(0);
  });
});

describe("readingAt", () => {
  const play = from("Closer the poles, greater is the force.")!;

  it("gives the teacher's own sentence at the end they wrote about", () => {
    // Closer poles is the LOW end of separation, and that is where the force
    // is greater.
    expect(readingAt(play, 0)).toBe("Closer poles → greater force");
  });

  it("gives the converse at the other end", () => {
    // The same statement read backwards, which is what a student is usually
    // asked to produce — and never a claim the sentence does not support.
    expect(readingAt(play, 1)).toBe("Further poles → smaller force");
  });

  it("keeps both halves flipping together", () => {
    const direct = from("Higher the temperature, faster is the reaction.")!;
    expect(readingAt(direct, 1)).toBe("Higher temperature → faster reaction");
    expect(readingAt(direct, 0)).toBe("Lower temperature → slower reaction");
  });
});

describe("tidying the phrase", () => {
  it("drops the filler the sentence pattern leaves behind", () => {
    // The detector's capture keeps "is the" on the effect side.
    const play = from("Greater the distance, weaker is the magnetic field.")!;
    expect(play.effect.thing).toBe("magnetic field");
  });
});

describe("one vocabulary, not two", () => {
  it("can point every comparative the detector can find", () => {
    // The drift this codebase keeps producing: a detector that matches a
    // sentence the interactive then cannot read. Building the detector's
    // pattern from this table makes that impossible, and this proves it for
    // every word rather than for the handful someone thought to try.
    for (const word of COMPARATIVE_WORDS) {
      const sentence = `${sentenceCase(word)} the aaa, greater is the bbb.`;
      const found = detectRelationship(sentence);
      expect(found, `detector missed "${word}"`).not.toBeNull();
      expect(toPlayable(found!.parts), `no direction for "${word}"`).not.toBeNull();
    }
  });

  it("gives every word an opposite that is itself a known word", () => {
    // Otherwise the converse reading names a comparative the detector could
    // never have produced, and the two halves of the widget disagree.
    for (const [word, { opposite }] of Object.entries(COMPARATIVES)) {
      expect(COMPARATIVES[opposite], `"${word}" opposes unknown "${opposite}"`).toBeDefined();
    }
  });

  it("has opposites that point the other way", () => {
    for (const [word, { direction, opposite }] of Object.entries(COMPARATIVES)) {
      expect(COMPARATIVES[opposite].direction, `"${word}" and "${opposite}" point the same way`).not.toBe(direction);
    }
  });
});

function sentenceCase(w: string) {
  return w.charAt(0).toUpperCase() + w.slice(1);
}
