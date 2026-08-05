import { describe, expect, it } from "vitest";
import { visibleAnswer } from "./giveaway";

// The fixtures are the real ones. Every prompt below is verbatim from the
// school's approved bank, so if the rule is ever loosened these stop being
// hypotheses and start failing.

describe("visibleAnswer, on the school's own questions", () => {
  it("catches the tautology", () => {
    // The deck sentence is "Permanent magnets are made from permanent magnetic
    // materials", and the question removed the repeated word. Nothing is being
    // asked.
    expect(
      visibleAnswer("Permanent magnets are made from ______ magnetic materials.", {
        kind: "fill",
        accept: ["permanent"],
      }),
    ).toBe("permanent");
  });

  it("catches an answer the prompt has already stated", () => {
    expect(
      visibleAnswer(
        "In a magnetised magnetic material, the domains point to north, and the head of the arrow shows ____.",
        { kind: "fill", accept: ["north"] },
      ),
    ).toBe("north");
  });

  it("catches the answer hiding in the subject of the sentence", () => {
    expect(
      visibleAnswer("Motion graphs can simplify the description of objects' ____.", {
        kind: "fill",
        accept: ["motion", "motion graphs"],
      }),
    ).toBe("motion");
  });

  it("leaves a real question alone", () => {
    // The one the bank should keep: the blank asks what the nail becomes, and
    // "magnet" is in the prompt as the thing doing the inducing.
    expect(
      visibleAnswer("A steel bar is stroked in one direction with one pole of a ____.", {
        kind: "fill",
        accept: ["permanent magnet"],
      }),
    ).toBeNull();
  });
});

describe("visibleAnswer", () => {
  it("does not read an answer out of the blank itself", () => {
    expect(visibleAnswer("The pivot is the ____ point.", { kind: "fill", accept: ["turning"] })).toBeNull();
  });

  it("ignores answers too short to be evidence of anything", () => {
    // "up" appearing in a prompt is not a leak, it is English.
    expect(visibleAnswer("The load moves up when the ____ goes down.", { kind: "fill", accept: ["up"] })).toBeNull();
  });

  it("matches whole words, not fragments", () => {
    // "north" inside "northerly" is a coincidence, and reporting it would
    // train a teacher to ignore the warning.
    expect(
      visibleAnswer("A compass needle swings northerly. It points to the ____.", {
        kind: "fill",
        accept: ["north pole"],
      }),
    ).toBeNull();
  });

  it("catches an MCQ whose right option is quoted in the question", () => {
    expect(
      visibleAnswer("An electromagnet can be switched off. Which can be switched off?", {
        kind: "mcq",
        options: ["A permanent magnet", "An electromagnet", "A steel bar"],
        correct: "B",
      }),
    ).toBe("An electromagnet");
  });

  it("says nothing when the prompt lists every option", () => {
    // "Which of these is X: a, b, c" shows the answer and the distractors
    // equally, and gives nothing away by doing so.
    expect(
      visibleAnswer("Of iron, copper and wood, which is magnetic?", {
        kind: "mcq",
        options: ["iron", "copper", "wood"],
        correct: "A",
      }),
    ).toBeNull();
  });

  it("has nothing to say about a true/false statement or a matching grid", () => {
    expect(visibleAnswer("Magnets attract copper.", { kind: "truefalse", correct: false })).toBeNull();
    expect(
      visibleAnswer("Match each term with its meaning.", {
        kind: "matching",
        pairs: [
          { left: "pivot", right: "the turning point" },
          { left: "load", right: "the weight moved" },
          { left: "effort", right: "the force applied" },
        ],
      }),
    ).toBeNull();
  });

  it("survives a malformed row rather than taking the teacher's panel down", () => {
    // `question jsonb not null` stops a SQL NULL and lets the JSON value null
    // through. This runs over every question on a deck during ingest, so one
    // bad row must not strand the whole upload.
    const bad = [null, undefined, {}, { kind: "fill" }, "not an object", 7];
    for (const q of bad) {
      expect(visibleAnswer("Anything with a ____ in it.", q as never)).toBeNull();
    }
  });

  it("survives an MCQ whose correct letter does not exist", () => {
    // validateQuestion rejects this shape, but this must not throw on the way
    // to finding that out.
    expect(
      visibleAnswer("Which is magnetic?", { kind: "mcq", options: ["iron", "wood"], correct: "D" }),
    ).toBeNull();
  });
});
