import { describe, expect, it } from "vitest";
import { validateQuestion } from "./validate";

// Every case below is a real shape produced by generation against the Grade 7
// magnetism deck, not an invented one. Roughly one question in twelve failed
// one of these checks before they existed.
describe("validateQuestion", () => {
  describe("matching", () => {
    it("rejects two rows offering the same meaning", () => {
      // A student who swaps the two identical meanings is marked wrong for an
      // answer that is exactly as true as the one expected.
      const problems = validateQuestion("Match each term with its meaning.", {
        kind: "matching",
        pairs: [
          { left: "Induced magnetism", right: "Induces a north pole in the far end of the nail" },
          { left: "North pole", right: "Induces a north pole in the far end of the nail" },
          { left: "South pole", right: "Magnetism produced in the nail by the magnet" },
        ],
      });
      expect(problems).toContain("two pairs share the same meaning");
    });

    it("rejects the same term appearing on more than one row", () => {
      // Nothing tells the student which row wants which property.
      const problems = validateQuestion("Match each magnet type to its property.", {
        kind: "matching",
        pairs: [
          { left: "Electromagnet", right: "Can be switched on and off" },
          { left: "Permanent magnet", right: "Cannot be turned off" },
          { left: "Electromagnet", right: "Strength can be changed" },
          { left: "Permanent magnet", right: "Strength cannot be varied" },
        ],
      });
      expect(problems).toContain("the same term appears on more than one row");
    });

    it("accepts a well-formed matching question", () => {
      expect(
        validateQuestion("Match each term with its meaning.", {
          kind: "matching",
          pairs: [
            { left: "Domain", right: "A small magnetic region" },
            { left: "Solenoid", right: "A coil of wire" },
            { left: "Pole", right: "Where the field is strongest" },
          ],
        }),
      ).toEqual([]);
    });
  });

  describe("mcq", () => {
    it("rejects a correct answer that is not one of the options", () => {
      const problems = validateQuestion("Which material is magnetic?", {
        kind: "mcq",
        correct: "D",
        options: ["Copper", "Iron", "Plastic"],
      });
      expect(problems[0]).toMatch(/not one of the options/);
    });

    it("rejects duplicate options, which give two right answers", () => {
      expect(
        validateQuestion("Which material is magnetic?", {
          kind: "mcq",
          correct: "B",
          options: ["Iron", "iron", "Plastic"],
        }),
      ).toContain("duplicate options");
    });

    it("accepts letter, and is not fooled by trailing punctuation", () => {
      expect(
        validateQuestion("Which material is magnetic?", {
          kind: "mcq",
          correct: "B)",
          options: ["Copper", "Iron", "Plastic"],
        }),
      ).toEqual([]);
    });
  });

  describe("fill", () => {
    it("rejects a prompt with no visible gap", () => {
      // Observed verbatim: without a blank the student is guessing which word
      // was removed, and any correct-sounding answer is marked wrong.
      expect(
        validateQuestion("Each piece of a broken magnet still has two poles. What are they?", {
          kind: "fill",
          accept: ["north and south"],
        }),
      ).toContain("no blank shown in the prompt");
    });

    it("accepts a prompt that shows the gap", () => {
      expect(
        validateQuestion("Iron is easy to ____ and easily loses its magnetism.", {
          kind: "fill",
          accept: ["magnetise", "magnetize"],
        }),
      ).toEqual([]);
    });
  });

  describe("truefalse", () => {
    it("rejects a prompt that is a question rather than a statement", () => {
      // Observed verbatim, answered `true` — there is no way to answer a
      // wh-question true or false, so the student loses the mark regardless.
      expect(
        validateQuestion(
          "When a magnetic material like iron or steel is placed near a pole of a permanent magnet, what happens to it?",
          { kind: "truefalse", correct: true },
        ),
      ).toContain("true/false prompt is a question rather than a statement");
    });

    it("accepts a statement, and the explicit 'True or false:' form", () => {
      expect(validateQuestion("Magnetic force is a non-contact force.", { kind: "truefalse", correct: true })).toEqual(
        [],
      );
      expect(
        validateQuestion("True or false: north poles can be separated from south poles?", {
          kind: "truefalse",
          correct: false,
        }),
      ).toEqual([]);
    });
  });

  describe("numeric", () => {
    it("rejects a qualitative question forced into a number", () => {
      // Observed verbatim, answered 0. The source says "a short time" — there
      // is no number in it, so no numeric answer can be right.
      expect(
        validateQuestion("How long does a temporary magnet keep its magnetic properties?", {
          kind: "numeric",
          expected: 0,
        }),
      ).toContain("numeric question asked about something the source answers in words");
    });

    it("accepts a genuine calculation", () => {
      expect(validateQuestion("Find the moment of the force.", { kind: "numeric", expected: 12, unit: "Nm" })).toEqual(
        [],
      );
    });
  });
});
