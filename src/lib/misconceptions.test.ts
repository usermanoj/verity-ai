import { describe, expect, it } from "vitest";
import {
  describeMisconception,
  findMisconceptions,
  normalise,
  type WrongAttempt,
} from "./misconceptions";

// The case this exists for is real and in the database: a student answered
// "At the centre" four times to the same question about magnetic field
// strength. Four rows in a list, indistinguishable from four different
// mistakes — and one of those means they have not learned it while the other
// means they have learned something wrong.

const attempt = (over: Partial<WrongAttempt> = {}): WrongAttempt => ({
  questionId: "q1",
  prompt: "When you dip a bar magnet in a heap of iron filings, where is the magnetic field strength concentrated?",
  // Exactly what the real rows hold: the letter, plus the option in words.
  answer: "B",
  chosenAnswer: "At the centre",
  correctAnswer: "At the poles",
  at: "2026-08-01T10:00:00Z",
  ...over,
});

/** Minutes apart, so each counts as its own decision. */
const minutesLater = (n: number) => new Date(Date.UTC(2026, 7, 1, 10, n)).toISOString();

describe("findMisconceptions", () => {
  it("finds the real one", () => {
    const out = findMisconceptions([0, 5, 10, 15].map((m) => attempt({ at: minutesLater(m) })));
    expect(out).toHaveLength(1);
    expect(out[0].occasions).toBe(4);
    expect(out[0].answer).toBe("At the centre");
    expect(out[0].correctAnswer).toBe("At the poles");
  });

  it("leaves a single mistake alone", () => {
    // Once is a mistake. Flagging it would bury the signal in noise.
    expect(findMisconceptions([attempt()])).toEqual([]);
  });

  it("does not count a double-tap as conviction", () => {
    // Two identical answers eight seconds apart is a slow connection or a
    // student pressing Check again to reread the feedback.
    const out = findMisconceptions([
      attempt({ at: "2026-08-01T10:00:00Z" }),
      attempt({ at: "2026-08-01T10:00:08Z" }),
    ]);
    expect(out).toEqual([]);
  });

  it("counts a second attempt minutes later", () => {
    const out = findMisconceptions([attempt({ at: minutesLater(0) }), attempt({ at: minutesLater(3) })]);
    expect(out[0].occasions).toBe(2);
  });

  it("keeps different wrong answers to one question apart", () => {
    // Trying three different things is not a misconception, it is guessing.
    const out = findMisconceptions([
      attempt({ answer: "At the centre", at: minutesLater(0) }),
      attempt({ answer: "Only outside the magnet", at: minutesLater(5) }),
      attempt({ answer: "It is the same everywhere", at: minutesLater(10) }),
    ]);
    expect(out).toEqual([]);
  });

  it("keeps the same answer to different questions apart", () => {
    // "zone" typed into two different fill-in-the-blanks is two mistakes.
    const out = findMisconceptions([
      attempt({ questionId: "q1", answer: "zone", at: minutesLater(0) }),
      attempt({ questionId: "q2", answer: "zone", at: minutesLater(5) }),
    ]);
    expect(out).toEqual([]);
  });

  it("treats capitals and stray spaces as the same answer", () => {
    // A typed answer, with no option to resolve — so it is shown as written.
    const out = findMisconceptions([
      attempt({ answer: "at the centre", chosenAnswer: null, at: minutesLater(0) }),
      attempt({ answer: "  At The Centre ", chosenAnswer: null, at: minutesLater(5) }),
    ]);
    expect(out[0].occasions).toBe(2);
    expect(out[0].answer).toBe("  At The Centre ");
  });

  it("drops attempts with no question to attach them to", () => {
    const out = findMisconceptions([
      attempt({ questionId: null, at: minutesLater(0) }),
      attempt({ questionId: null, at: minutesLater(5) }),
    ]);
    expect(out).toEqual([]);
  });

  it("puts the most repeated first", () => {
    const out = findMisconceptions([
      ...[0, 5].map((m) => attempt({ questionId: "q1", answer: "a", at: minutesLater(m) })),
      ...[0, 5, 10, 15].map((m) => attempt({ questionId: "q2", answer: "b", at: minutesLater(m) })),
    ]);
    expect(out.map((m) => m.questionId)).toEqual(["q2", "q1"]);
  });

  it("reads rows in any order", () => {
    const out = findMisconceptions([attempt({ at: minutesLater(9) }), attempt({ at: minutesLater(1) })]);
    expect(out[0].firstAt).toBe(minutesLater(1));
    expect(out[0].lastAt).toBe(minutesLater(9));
  });

  it("survives an unparseable timestamp without inventing an occasion", () => {
    const out = findMisconceptions([attempt({ at: "not a date" }), attempt({ at: minutesLater(0) })]);
    expect(out).toEqual([]);
  });
});

describe("normalise", () => {
  it("does not merge answers that are different mistakes", () => {
    // "1/2" and "0.5" are the same number and not the same answer from a
    // student learning to convert. Merging them erases the mistake.
    expect(normalise("1/2")).not.toBe(normalise("0.5"));
  });
});

describe("describeMisconception", () => {
  const m = {
    questionId: "q1",
    prompt: "p",
    answer: "At the centre",
    submitted: "B",
    correctAnswer: "At the poles",
    occasions: 4,
    firstAt: "a",
    lastAt: "b",
  };

  it("states what happened and stops", () => {
    const text = describeMisconception(m);
    expect(text).toContain("“At the centre” 4 times");
    expect(text).toContain("The answer is “At the poles”");
    // It must not diagnose. "They think the field is strongest in the middle"
    // may well be right, and it is the teacher's inference to draw.
    expect(text.toLowerCase()).not.toContain("thinks");
    expect(text.toLowerCase()).not.toContain("believes");
  });

  it("says twice rather than 2 times", () => {
    expect(describeMisconception({ ...m, occasions: 2 })).toContain("twice");
  });

  it("says nothing about the right answer when it was not recorded", () => {
    const text = describeMisconception({ ...m, correctAnswer: null });
    expect(text).toContain("At the centre");
    expect(text).not.toContain("The answer is");
  });
});

describe("the letter and the words", () => {
  it("shows the option, not the position in a list", () => {
    // The defect this fixes: "Answered B twice" is half a sentence, because B
    // is a place in a list the teacher cannot see.
    const out = findMisconceptions([attempt({ at: minutesLater(0) }), attempt({ at: minutesLater(5) })]);
    expect(out[0].answer).toBe("At the centre");
    expect(describeMisconception(out[0])).toContain("At the centre");
    expect(describeMisconception(out[0])).not.toContain("“B”");
  });

  it("keeps what they submitted, whatever is displayed", () => {
    // The raw answer is evidence about a child and must survive the rewrite.
    const out = findMisconceptions([attempt({ at: minutesLater(0) }), attempt({ at: minutesLater(5) })]);
    expect(out[0].submitted).toBe("B");
  });

  it("falls back to the submission when no option was resolved", () => {
    // An older attempt, or a question since regenerated.
    const out = findMisconceptions([
      attempt({ chosenAnswer: null, at: minutesLater(0) }),
      attempt({ chosenAnswer: null, at: minutesLater(5) }),
    ]);
    expect(out[0].answer).toBe("B");
  });

  it("groups on the submission, not on the words", () => {
    // Two attempts where only one resolved must still count as a repeat.
    const out = findMisconceptions([
      attempt({ chosenAnswer: null, at: minutesLater(0) }),
      attempt({ chosenAnswer: "At the centre", at: minutesLater(5) }),
    ]);
    expect(out[0].occasions).toBe(2);
    expect(out[0].answer).toBe("At the centre");
  });
});
