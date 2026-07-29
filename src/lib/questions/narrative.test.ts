import { describe, expect, it } from "vitest";
import { isNarrativeRecall } from "./narrative";
import type { Question } from "@/lib/grade";

const mcq = (correct: string, options: string[]): Question => ({ kind: "mcq", correct, options });
const fill = (...accept: string[]): Question => ({ kind: "fill", accept });
const tf = (correct: boolean, because?: string): Question => ({ kind: "truefalse", correct, because });

describe("isNarrativeRecall — questions it must drop", () => {
  it("drops who-discovered-it", () => {
    expect(isNarrativeRecall("Who first discovered that lodestones attract iron?", mcq("A", ["a", "b", "c"]))).toBe(true);
  });

  it("drops it with words between the who and the verb", () => {
    // "Who is generally credited with inventing…" — the same question wearing
    // a longer sentence.
    expect(isNarrativeRecall("Who is generally credited with inventing the compass?", fill("Shen Kuo"))).toBe(true);
  });

  it("drops in-what-year and in-which-century", () => {
    expect(isNarrativeRecall("In what year was the electromagnet invented?", fill("1825"))).toBe(true);
    expect(isNarrativeRecall("In which century were lodestones first used?", fill("11th"))).toBe(true);
  });

  it("drops a question whose answer is a date, however it was asked", () => {
    // The prompt reads as ordinary physics; only the answer gives it away.
    expect(isNarrativeRecall("Lodestones were used for navigation from ____.", fill("the 11th century"))).toBe(true);
    expect(isNarrativeRecall("Magnetism was first written about in ____.", fill("600 BCE"))).toBe(true);
  });

  it("drops a true/false statement about a date", () => {
    // The statement is the prompt, and there is no answer text to inspect —
    // which is why the prompt is checked for dates too.
    expect(isNarrativeRecall("The compass was in use by the 12th century.", tf(true))).toBe(true);
  });

  it("drops one where only the explanation carries the date", () => {
    expect(isNarrativeRecall("Lodestones occur naturally.", tf(true, "They were described in 300 BC."))).toBe(true);
  });

  it("drops which-civilisation", () => {
    expect(isNarrativeRecall("Which ancient civilisation first used the compass?", fill("Chinese"))).toBe(true);
  });

  it("drops which-person, however many adjectives are in the way", () => {
    // Both taken verbatim from the approved bank. The first slipped past the
    // first draft of this file, which only knew about civilisations.
    expect(
      isNarrativeRecall("Which person used magnets for surgical purposes around the same time as Thales of Miletus?", fill("Sushruta")),
    ).toBe(true);
    expect(
      isNarrativeRecall("According to the text, which ancient Greek scholar investigated magnetism?", fill("Thales")),
    ).toBe(true);
  });

  it("drops a century spelled out as a word", () => {
    // Also from the bank: "in the first century" is the same question as
    // "in the 1st century", and only the second was being caught.
    expect(
      isNarrativeRecall("The Chinese described using a lodestone to attract a ____ in the first century.", fill("needle")),
    ).toBe(true);
  });
});

describe("isNarrativeRecall — questions it must NOT drop", () => {
  // The whole risk of this check. A dropped question is never shown to a
  // teacher, so a false positive is invisible: nobody finds out that a good
  // question was silently thrown away.

  it("keeps a 'when' question about physics", () => {
    expect(isNarrativeRecall("When does a temporary magnet lose its magnetism?", fill("when the current stops"))).toBe(false);
  });

  it("keeps 'which' and 'what' questions about materials", () => {
    expect(isNarrativeRecall("Which metal is magnetic?", mcq("A", ["iron", "copper", "rubber"]))).toBe(false);
    expect(isNarrativeRecall("What happens to the nail when the current is switched off?", fill("it loses its magnetism"))).toBe(false);
  });

  it("keeps a numeric answer that happens to look like a year", () => {
    // 1200 turns of wire is a quantity, not a date. Bare four-digit numbers
    // are deliberately not treated as dates for exactly this reason.
    expect(isNarrativeRecall("How many turns of wire does the coil have?", { kind: "numeric", expected: 1200 })).toBe(false);
    expect(isNarrativeRecall("The coil has ____ turns.", fill("1200"))).toBe(false);
  });

  it("keeps a question about who a rule applies to", () => {
    expect(isNarrativeRecall("Who should the right-hand grip rule be applied by?", fill("the student"))).toBe(false);
  });

  it("keeps 'second' as the unit of time", () => {
    // The spelled-out century list contains "second". It only fires directly
    // before the word "century", so a measurement in seconds is untouched.
    expect(isNarrativeRecall("How far does the trolley travel in the second after release?", { kind: "numeric", expected: 4 })).toBe(
      false,
    );
  });

  it("keeps a question about which material, which is the same shape as which-person", () => {
    expect(isNarrativeRecall("According to the text, lodestones are made from which iron mineral?", fill("magnetite"))).toBe(false);
  });

  it("keeps a matching question on vocabulary", () => {
    const q: Question = {
      kind: "matching",
      pairs: [
        { left: "Electromagnet", right: "A magnet made by an electric current" },
        { left: "Permanent magnet", right: "A magnet that keeps its magnetism" },
        { left: "Induced magnetism", right: "Magnetism caused by a nearby magnet" },
      ],
    };
    expect(isNarrativeRecall("Match each term to its meaning.", q)).toBe(false);
  });

  it("does not treat a wrong option that is a date as making the question historical", () => {
    // A distractor is not what the question is testing. Marked answer only.
    expect(isNarrativeRecall("What makes a nail magnetic?", mcq("A", ["a current", "the 12th century", "iron"]))).toBe(false);
  });

  it("resolves a stored letter to the option the student saw before judging it", () => {
    // The answer is stored as "B", so judging "B" itself would miss the date
    // entirely — the same letter-to-words resolution the analytics needed.
    expect(isNarrativeRecall("Lodestones were first described when?", mcq("B", ["today", "300 BCE", "last year"]))).toBe(true);
  });
});
