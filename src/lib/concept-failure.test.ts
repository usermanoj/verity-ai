import { describe, expect, it } from "vitest";
import {
  conceptsToReteach,
  lessonsToRevisit,
  optionText,
  topMisconception,
  untitledLesson,
  MIN_ATTEMPTS,
  UNTITLED_LESSON,
  type AskedAbout,
  type QuestionOutcome,
} from "./concept-failure";

const OPTIONS = ["iron", "steel", "copper", "rubber"];

function q(over: Partial<QuestionOutcome> = {}): QuestionOutcome {
  return {
    questionId: over.questionId ?? "q1",
    prompt: over.prompt ?? "Which metal is magnetic?",
    level: "Medium",
    chunkId: over.chunkId ?? "c1",
    heading: over.heading ?? "Magnetic materials",
    document: "Magnets and Electromagnets",
    attempts: 0,
    wrong: 0,
    students: 0,
    wrongAnswers: {},
    options: OPTIONS,
    ...over,
  };
}

describe("optionText", () => {
  it("turns a stored letter into the words the student saw", () => {
    // "B" tells a teacher nothing; "steel" tells them the class believes
    // steel isn't magnetic.
    expect(optionText("B", OPTIONS)).toBe("steel");
  });

  it("leaves a typed answer alone", () => {
    expect(optionText("magnetite", OPTIONS)).toBe("magnetite");
  });

  it("leaves a letter alone when there are no options to resolve it against", () => {
    expect(optionText("B", [])).toBe("B");
  });

  it("does not mangle a single-letter answer that is genuinely the answer", () => {
    // A fill-in-the-blank whose answer is "N" with no options must survive.
    expect(optionText("N", [])).toBe("N");
  });
});

describe("topMisconception", () => {
  it("names the wrong answer most of them gave", () => {
    const m = topMisconception({ wrongAnswers: { B: 11, C: 2, D: 1 }, options: OPTIONS });
    expect(m).toMatchObject({ answer: "steel", count: 11 });
    expect(m?.share).toBeCloseTo(11 / 14);
  });

  it("returns null when the wrong answers are scattered", () => {
    // The common, boring case. Promoting whichever answer came first would
    // invent a misconception the class does not have.
    expect(topMisconception({ wrongAnswers: { B: 3, C: 3, D: 2 }, options: OPTIONS })).toBeNull();
  });

  it("ignores a lone wrong answer", () => {
    // One child picking something is not a shared belief.
    expect(topMisconception({ wrongAnswers: { B: 1 }, options: OPTIONS })).toBeNull();
  });

  it("returns null when nothing was answered wrongly", () => {
    expect(topMisconception({ wrongAnswers: {}, options: OPTIONS })).toBeNull();
  });

  it("ignores blank answers rather than reporting them as a belief", () => {
    expect(topMisconception({ wrongAnswers: { "": 9 }, options: OPTIONS })).toBeNull();
  });
});

describe("conceptsToReteach", () => {
  it("merges a section that was re-uploaded under a new chunk id", () => {
    // The bug this grouping exists for. Approving a deck a second time mints
    // new chunk ids for the same sections, so 5 attempts and 5 attempts became
    // two concepts of 5 rather than one of 10 — and with MIN_ATTEMPTS at 5,
    // one more re-upload would push both under the floor and silence a section
    // the class is genuinely failing.
    const out = conceptsToReteach([
      q({ questionId: "a", chunkId: "old-copy", heading: "Early history of magnetism", attempts: 5, wrong: 4, students: 1 }),
      q({ questionId: "b", chunkId: "new-copy", heading: "Early history of magnetism", attempts: 5, wrong: 3, students: 1 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ attempts: 10, wrong: 7, heading: "Early history of magnetism" });
  });

  it("counts a child who answered both copies once, not twice", () => {
    // The other half of the same fault: summing students across copies would
    // report two children where there is one.
    const out = conceptsToReteach([
      q({ questionId: "a", chunkId: "old-copy", heading: "Magnetic fields", attempts: 6, wrong: 4, students: 1 }),
      q({ questionId: "b", chunkId: "new-copy", heading: "Magnetic fields", attempts: 6, wrong: 4, students: 1 }),
    ]);
    expect(out[0].students).toBe(1);
  });

  it("does not merge the same heading from two different documents", () => {
    // Physics and Chemistry can both have an "Introduction". They are not one
    // lesson, and a teacher told to reteach "Introduction" learns nothing.
    const out = conceptsToReteach([
      q({ questionId: "a", chunkId: "c1", document: "Physics", heading: "Introduction", attempts: 6, wrong: 4, students: 6 }),
      q({ questionId: "b", chunkId: "c2", document: "Chemistry", heading: "Introduction", attempts: 6, wrong: 4, students: 6 }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("does not merge two sections that merely share the untitled placeholder", () => {
    // Every deck has several. Merging them invents a concept that does not
    // exist, labelled with a heading that points a teacher nowhere.
    const out = conceptsToReteach([
      q({ questionId: "a", chunkId: "c1", heading: "Untitled section", attempts: 6, wrong: 4, students: 6 }),
      q({ questionId: "b", chunkId: "c2", heading: "Untitled section", attempts: 6, wrong: 4, students: 6 }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("merges headings that differ only in case or spacing", () => {
    // Re-extraction is not byte-identical: a trailing space or a capital is
    // not a different section.
    const out = conceptsToReteach([
      q({ questionId: "a", chunkId: "c1", heading: "Magnetic  Materials ", attempts: 5, wrong: 3, students: 1 }),
      q({ questionId: "b", chunkId: "c2", heading: "magnetic materials", attempts: 5, wrong: 3, students: 1 }),
    ]);
    expect(out).toHaveLength(1);
    // The first spelling seen is the one shown — not a normalised, lowercased
    // version, which would look like a bug to a teacher.
    expect(out[0].heading).toBe("Magnetic  Materials ");
  });

  it("cannot collide two lessons whose names run together", () => {
    // "Forces" + "and motion" against "Forces and" + "motion". Joining the two
    // with a space would make these one key and one instruction to reteach.
    const out = conceptsToReteach([
      q({ questionId: "a", chunkId: "c1", document: "Forces", heading: "and motion", attempts: 6, wrong: 4, students: 6 }),
      q({ questionId: "b", chunkId: "c2", document: "Forces and", heading: "motion", attempts: 6, wrong: 4, students: 6 }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("gives each concept a key that is stable across a re-upload", () => {
    // The React key. If it carried a chunk id, a re-upload would remount every
    // row; worse, it is the identity the grouping is built on.
    const [a] = conceptsToReteach([q({ chunkId: "old", heading: "Fields", attempts: 6, wrong: 4, students: 6 })]);
    const [b] = conceptsToReteach([q({ chunkId: "new", heading: "Fields", attempts: 6, wrong: 4, students: 6 })]);
    expect(a.key).toBe(b.key);
    expect(a.key).not.toContain("old");
  });

  it("groups questions by the section they came from", () => {
    const out = conceptsToReteach([
      q({ questionId: "a", chunkId: "c1", attempts: 10, wrong: 6, students: 10 }),
      q({ questionId: "b", chunkId: "c1", attempts: 10, wrong: 4, students: 10 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ attempts: 20, wrong: 10, students: 10 });
  });

  it("stays silent on a concept with too little evidence", () => {
    // One confused child must not look like a curriculum problem.
    const out = conceptsToReteach([q({ attempts: MIN_ATTEMPTS - 1, wrong: 3, students: 1 })]);
    expect(out).toEqual([]);
  });

  it("says nothing about a concept nobody got wrong", () => {
    expect(conceptsToReteach([q({ attempts: 20, wrong: 0, students: 20 })])).toEqual([]);
  });

  it("ranks by how many students got it wrong, not by rate", () => {
    // "Rare idea" fails 100% of six attempts; "Common idea" fails 50% of
    // twenty. The rate flatters the first, but ten children are stuck on the
    // second and only six on the first — and a teacher's Monday goes to the
    // ten. Both clear the evidence floor, so this tests the ordering rather
    // than the filter.
    const out = conceptsToReteach([
      q({ questionId: "tiny", chunkId: "small", heading: "Rare idea", attempts: 6, wrong: 6, students: 6 }),
      q({ questionId: "big", chunkId: "broad", heading: "Common idea", attempts: 20, wrong: 10, students: 20 }),
    ]);
    expect(out.map((c) => c.heading)).toEqual(["Common idea", "Rare idea"]);
    expect(out[0].failureRate).toBeLessThan(out[1].failureRate);
  });

  it("does not sum distinct students across questions", () => {
    // The same ten children answering two questions is ten students, not
    // twenty — a rolled-up count that double-counts a class is worse than
    // no count.
    const out = conceptsToReteach([
      q({ questionId: "a", chunkId: "c1", attempts: 10, wrong: 5, students: 10 }),
      q({ questionId: "b", chunkId: "c1", attempts: 10, wrong: 5, students: 10 }),
    ]);
    expect(out[0].students).toBe(10);
  });

  it("surfaces the worst question and its misconception", () => {
    const out = conceptsToReteach([
      q({ questionId: "easy", chunkId: "c1", prompt: "Easy one", attempts: 10, wrong: 1, students: 10 }),
      q({
        questionId: "hard",
        chunkId: "c1",
        prompt: "Which metal is magnetic?",
        attempts: 14,
        wrong: 12,
        students: 14,
        wrongAnswers: { B: 11, C: 1 },
      }),
    ]);
    expect(out[0].worstQuestion?.prompt).toBe("Which metal is magnetic?");
    expect(out[0].misconception?.answer).toBe("steel");
  });

  it("reports no misconception when the worst question has no clear pattern", () => {
    const out = conceptsToReteach([
      q({ attempts: 12, wrong: 6, students: 12, wrongAnswers: { B: 2, C: 2, D: 2 } }),
    ]);
    expect(out[0].misconception).toBeNull();
  });
});

describe("lessonsToRevisit", () => {
  const row = (over: Partial<AskedAbout>): AskedAbout => ({
    topic: "Lesson",
    presses: 0,
    students: 0,
    maxInOneSitting: 0,
    repeatedStudents: 0,
    ...over,
  });

  it("puts repeated asking above raw volume", () => {
    // Twenty students pressing Explain once each is a popular lesson. Three
    // pressing it four times each is a lesson that did not land.
    const out = lessonsToRevisit([
      row({ topic: "Popular", presses: 20, students: 20, maxInOneSitting: 1 }),
      row({ topic: "Confusing", presses: 12, students: 3, maxInOneSitting: 4, repeatedStudents: 3 }),
    ]);
    expect(out.map((r) => r.topic)).toEqual(["Confusing", "Popular"]);
  });

  it("keeps a lesson where one student asked repeatedly", () => {
    // The signal that gets lost in a total.
    const out = lessonsToRevisit([row({ topic: "Quiet", presses: 4, students: 1, maxInOneSitting: 4, repeatedStudents: 1 })]);
    expect(out).toHaveLength(1);
  });

  it("drops lessons nobody asked about", () => {
    expect(lessonsToRevisit([row({ topic: "Untouched", presses: 0 })])).toEqual([]);
  });

  it("drops the lesson whose name is gone, even when it would rank first", () => {
    // The real shape of the data: 25 requests with no lesson name against 10
    // with one. Ranking it first made the loudest thing on the page a mystery
    // a teacher could do nothing about.
    const out = lessonsToRevisit([
      row({ topic: UNTITLED_LESSON, presses: 25, students: 1, maxInOneSitting: 9, repeatedStudents: 1 }),
      row({ topic: "Magnets and Electromagnets", presses: 10, students: 1, maxInOneSitting: 6, repeatedStudents: 1 }),
    ]);
    expect(out.map((r) => r.topic)).toEqual(["Magnets and Electromagnets"]);
  });

  it("treats a blank title the same as a missing one", () => {
    expect(lessonsToRevisit([row({ topic: "   ", presses: 9, maxInOneSitting: 9 })])).toEqual([]);
  });

  it("does not drop a lesson that merely mentions the word untitled", () => {
    // The sentinel is matched exactly, not by substring — a real lesson called
    // "Untitled lesson plans, week 3" is a real lesson.
    const out = lessonsToRevisit([row({ topic: "Untitled lesson plans, week 3", presses: 4, maxInOneSitting: 4 })]);
    expect(out).toHaveLength(1);
  });
});

describe("untitledLesson", () => {
  const row = (over: Partial<AskedAbout>): AskedAbout => ({
    topic: "Lesson",
    presses: 0,
    students: 0,
    maxInOneSitting: 0,
    repeatedStudents: 0,
    ...over,
  });

  it("reports what was dropped, so the panel can account for it", () => {
    // A list that quietly shrinks is the same fault as an accuracy figure
    // computed over staff: the number is right and the reading of it is wrong.
    const hidden = untitledLesson([
      row({ topic: UNTITLED_LESSON, presses: 25, students: 1, maxInOneSitting: 9 }),
      row({ topic: "Magnets", presses: 10 }),
    ]);
    expect(hidden).toMatchObject({ presses: 25, maxInOneSitting: 9 });
  });

  it("returns null when every lesson has a name", () => {
    expect(untitledLesson([row({ topic: "Magnets", presses: 10 })])).toBeNull();
  });

  it("returns null rather than an empty row when the untitled lesson had no presses", () => {
    // Nothing to account for, so nothing should be said.
    expect(untitledLesson([row({ topic: UNTITLED_LESSON, presses: 0 })])).toBeNull();
  });

  it("sums across several untitled rows rather than reporting the first", () => {
    // The SQL groups by topic so there is normally one row. This guards the
    // count against a future grouping change under-reporting.
    const hidden = untitledLesson([
      row({ topic: UNTITLED_LESSON, presses: 8, maxInOneSitting: 4 }),
      row({ topic: "", presses: 6, maxInOneSitting: 6 }),
    ]);
    expect(hidden).toMatchObject({ presses: 14, maxInOneSitting: 6 });
  });

  it("does not mutate its input", () => {
    const rows = [row({ topic: "B", presses: 1 }), row({ topic: "A", presses: 1 })];
    lessonsToRevisit(rows);
    expect(rows.map((r) => r.topic)).toEqual(["B", "A"]);
  });
});
