import { describe, it, expect } from "vitest";
import { grade, gradeNumeric, gradeMcq, gradeTrueFalse, gradeFill, gradeMatching, parseNumber } from "./grade";

import type { McqQuestion, MatchingQuestion } from "./grade";

describe("parseNumber", () => {
  it("extracts value from messy answers", () => {
    expect(parseNumber("= 300 Nm")).toBe(300);
    expect(parseNumber("Moment is 28 Nm clockwise")).toBe(28);
    expect(parseNumber("600N")).toBe(600);
    expect(parseNumber("no number here")).toBeNull();
    expect(parseNumber("2.4 Nm")).toBe(2.4);
  });
});

describe("gradeNumeric — seesaw / lever", () => {
  const q = { kind: "numeric", expected: 28, unit: "Nm", direction: "clockwise" } as const;

  it("accepts exact correct answer", () => {
    const r = gradeNumeric(q, "28 Nm clockwise");
    expect(r.correct).toBe(true);
    expect(r.score).toBe(1);
  });

  it("accepts newton metre spelled out", () => {
    const r = gradeNumeric(q, "28 newton metres clockwise");
    expect(r.correct).toBe(true);
  });

  it("rejects wrong number outright (no reward for guessing)", () => {
    const r = gradeNumeric(q, "30 Nm clockwise");
    expect(r.correct).toBe(false);
    expect(r.score).toBe(0);
  });

  it("flags missing/wrong direction but right value", () => {
    const r = gradeNumeric(q, "28 Nm anticlockwise");
    expect(r.correct).toBe(false);
    expect(r.details.valueOk).toBe(true);
    expect(r.details.directionOk).toBe(false);
    expect(r.feedback).toMatch(/direction/i);
  });

  it("flags wrong unit but right value", () => {
    const r = gradeNumeric(q, "28 N clockwise");
    expect(r.details.valueOk).toBe(true);
    expect(r.details.unitOk).toBe(false);
  });

  it("respects tolerance", () => {
    const qt = { kind: "numeric", expected: 600, unit: "N", tolerance: 5 } as const;
    expect(gradeNumeric(qt, "601 N").correct).toBe(true);
    expect(gradeNumeric(qt, "610 N").correct).toBe(false);
  });
});

describe("gradeMcq", () => {
  const q = { kind: "mcq", correct: "C" } as const;
  it("matches regardless of punctuation/case", () => {
    expect(gradeMcq(q, "c").correct).toBe(true);
    expect(gradeMcq(q, "C)").correct).toBe(true);
    expect(gradeMcq(q, " C. ").correct).toBe(true);
    expect(gradeMcq(q, "A").correct).toBe(false);
  });
});

describe("gradeMcq — with options", () => {
  const q = {
    kind: "mcq",
    correct: "B",
    options: ["Copper", "Iron", "Plastic"],
  } as const;

  it("accepts the letter, the position, or the option's own text", () => {
    expect(gradeMcq(q, "B").correct).toBe(true);
    expect(gradeMcq(q, "2").correct).toBe(true);
    expect(gradeMcq(q, "Iron").correct).toBe(true);
    expect(gradeMcq(q, "iron.").correct).toBe(true);
    expect(gradeMcq(q, "Copper").correct).toBe(false);
  });

  it("names the right answer when wrong, instead of just saying no", () => {
    // On its own field rather than inside the sentence, so the UI can present
    // it the same way for every question kind.
    expect(gradeMcq(q, "A").correctAnswer).toBe("Iron");
    expect(gradeMcq(q, "B").correctAnswer).toBeUndefined();
  });
});

// Every kind has to reveal its answer, not just the ones whose feedback
// sentence happened to mention it. A student who cannot see what they should
// have said learns nothing from getting it wrong.
describe("correctAnswer is populated for every question kind", () => {
  it("reveals on a wrong attempt and stays absent on a right one", () => {
    expect(grade({ kind: "numeric", expected: 300, unit: "Nm" }, "12 Nm").correctAnswer).toBe("300 Nm");
    expect(grade({ kind: "numeric", expected: 300, unit: "Nm" }, "300 Nm").correctAnswer).toBeUndefined();

    expect(grade({ kind: "truefalse", correct: false }, "True").correctAnswer).toBe("False");
    expect(grade({ kind: "truefalse", correct: false }, "False").correctAnswer).toBeUndefined();

    expect(grade({ kind: "fill", accept: ["magnetised"] }, "magnetic").correctAnswer).toBe("magnetised");

    const matching = {
      kind: "matching",
      pairs: [
        { left: "Domain", right: "A small magnetic region" },
        { left: "Solenoid", right: "A coil of wire" },
      ],
    } as const;
    expect(grade(matching, "0=A coil of wire").correctAnswer).toContain("Domain → A small magnetic region");
  });
});

describe("gradeTrueFalse", () => {
  const q = { kind: "truefalse", correct: true, because: "only two magnets repel." } as const;

  it("accepts the words a student actually types", () => {
    for (const yes of ["True", "true", "T", "yes"]) expect(gradeTrueFalse(q, yes).correct).toBe(true);
    for (const no of ["False", "f", "no"]) expect(gradeTrueFalse(q, no).correct).toBe(false);
  });

  it("explains why, rather than only marking it", () => {
    expect(gradeTrueFalse(q, "True").feedback).toContain("only two magnets repel");
  });

  it("asks again rather than marking gibberish wrong", () => {
    expect(gradeTrueFalse(q, "maybe").feedback).toMatch(/True or False/);
  });
});

describe("gradeFill", () => {
  const q = { kind: "fill", accept: ["magnetised"] } as const;

  it("does not fail an ESL student on case, spacing or punctuation", () => {
    expect(gradeFill(q, "Magnetised").correct).toBe(true);
    expect(gradeFill(q, "  magnetised. ").correct).toBe(true);
  });

  it("accepts the American spelling of a British syllabus word", () => {
    expect(gradeFill(q, "magnetized").correct).toBe(true);
  });

  it("still rejects a different word", () => {
    expect(gradeFill(q, "magnetic").correct).toBe(false);
  });
});

describe("gradeMatching", () => {
  const q = {
    kind: "matching",
    pairs: [
      { left: "Domain", right: "A small magnetic region" },
      { left: "Solenoid", right: "A coil of wire" },
      { left: "Pole", right: "Where the field is strongest" },
    ],
  } as const;

  it("marks a full match correct", () => {
    const answer = q.pairs.map((p, i) => `${i}=${p.right}`).join("\n");
    expect(gradeMatching(q, answer).correct).toBe(true);
  });

  it("still grades an answer keyed by the term, as older ones were", () => {
    const answer = q.pairs.map((p) => `${p.left}=${p.right}`).join("\n");
    expect(gradeMatching(q, answer).correct).toBe(true);
  });

  it("grades repeated terms independently, one row at a time", () => {
    // A real generated question: two terms, four rows, one per property.
    // Keying answers by the term's text made rows 0 and 2 share an answer, so
    // four choices graded as two.
    const repeated = {
      kind: "matching",
      pairs: [
        { left: "Electromagnet", right: "Can be switched on and off" },
        { left: "Permanent magnet", right: "Cannot be turned off" },
        { left: "Electromagnet", right: "Strength can be changed" },
        { left: "Permanent magnet", right: "Strength cannot be varied" },
      ],
    } as const;

    const allRight = repeated.pairs.map((p, i) => `${i}=${p.right}`).join("\n");
    expect(gradeMatching(repeated, allRight).correct).toBe(true);

    // Getting row 2 wrong must cost exactly one mark, not two.
    const oneWrong = repeated.pairs
      .map((p, i) => `${i}=${i === 2 ? "Cannot be turned off" : p.right}`)
      .join("\n");
    const r = gradeMatching(repeated, oneWrong);
    expect(r.score).toBeCloseTo(3 / 4);
  });

  it("gives partial credit, because two of three is not nothing", () => {
    const answer = `Domain=A small magnetic region\nSolenoid=A coil of wire\nPole=A coil of wire`;
    const r = gradeMatching(q, answer);
    expect(r.correct).toBe(false);
    expect(r.score).toBeCloseTo(2 / 3);
    expect(r.feedback).toContain("2 of 3");
  });

  it("scores an unanswered question zero without throwing", () => {
    expect(gradeMatching(q, "").score).toBe(0);
  });
});

describe("grade dispatch", () => {
  it("routes every question kind", () => {
    expect(grade({ kind: "numeric", expected: 300, unit: "N" }, "300 N").correct).toBe(true);
    expect(grade({ kind: "mcq", correct: "B" }, "b").correct).toBe(true);
    expect(grade({ kind: "truefalse", correct: false }, "False").correct).toBe(true);
    expect(grade({ kind: "fill", accept: ["iron"] }, "Iron").correct).toBe(true);
    expect(grade({ kind: "matching", pairs: [{ left: "a", right: "b" }] }, "a=b").correct).toBe(true);
  });
});

// What the student chose, in words.
//
// The stored answer is their raw submission, which for a multiple choice is a
// letter. A teacher reading "answered B, the answer is At the poles" is reading
// half a sentence — B is a position in a list they cannot see. This is the real
// case from the school's database.
describe("chosenAnswer", () => {
  const FILINGS: McqQuestion = {
    kind: "mcq",
    correct: "A",
    options: ["At the poles", "At the centre", "Only outside the magnet", "It is the same everywhere"],
  };

  it("says which option a letter meant", () => {
    expect(gradeMcq(FILINGS, "B").chosenAnswer).toBe("At the centre");
  });

  it("works however the choice was submitted", () => {
    // A click sends a letter, a typed answer sends the text, an older client
    // sent a position. All name the same option.
    for (const given of ["B", "b)", "2", "At the centre"]) {
      expect(gradeMcq(FILINGS, given).chosenAnswer).toBe("At the centre");
    }
  });

  it("says nothing when they were right", () => {
    // Nothing to explain, and a teacher's screen should not carry it.
    expect(gradeMcq(FILINGS, "A").chosenAnswer).toBeUndefined();
  });

  it("does not rewrite the evidence", () => {
    // The raw answer is what the child submitted and must survive untouched;
    // chosenAnswer sits beside it, never in place of it.
    const result = gradeMcq(FILINGS, "B");
    expect(result.correctAnswer).toBe("At the poles");
    expect(result.chosenAnswer).toBe("At the centre");
  });

  it("names the terms a matching answer was keyed by index", () => {
    // Stored as "0=8 Nm", which says nothing about which term row 0 was.
    const q: MatchingQuestion = {
      kind: "matching",
      pairs: [
        { left: "2 m × 4 N", right: "8 Nm" },
        { left: "0.4 m × 6 N", right: "2.4 Nm" },
      ],
    };
    const out = gradeMcqOrMatching(q, "0=2.4 Nm\n1=8 Nm");
    expect(out.chosenAnswer).toBe("2 m × 4 N → 2.4 Nm; 0.4 m × 6 N → 8 Nm");
  });

  it("marks a pair they left blank rather than dropping it", () => {
    const q: MatchingQuestion = {
      kind: "matching",
      pairs: [
        { left: "A", right: "1" },
        { left: "B", right: "2" },
      ],
    };
    expect(gradeMcqOrMatching(q, "0=9").chosenAnswer).toContain("B → —");
  });
});

function gradeMcqOrMatching(q: MatchingQuestion, answer: string) {
  return gradeMatching(q, answer);
}

// Everything below was found by replaying the school's own approved questions
// through this grader. Each fixture is a real question, so a regression here
// is a mark a real student loses.

describe("a direction the question never asked for", () => {
  // Six of the twenty approved numeric questions carry direction:"clockwise"
  // while asking only for a magnitude. A force and a distance do not fix a
  // direction, and the prompt does not mention one.
  const real = { kind: "numeric", expected: 8, unit: "Nm", direction: "clockwise" } as const;
  const asked = "What is the turning effect when the force is 4 N and the distance is 2 m?";

  it("marks the whole right answer right", () => {
    const r = gradeNumeric(real, "8 Nm", asked);
    expect(r.correct).toBe(true);
    expect(r.score).toBe(1);
  });

  it("does not show the student a direction chip for it", () => {
    // A green tick against "direction" on a question that never mentioned
    // direction is as confusing as the red cross it replaces.
    expect(gradeNumeric(real, "8 Nm", asked).details.directionGraded).toBe(false);
  });

  it("does not name a direction in the right answer it shows", () => {
    const r = gradeNumeric(real, "9 Nm", asked);
    expect(r.correctAnswer).toBe("8 Nm");
  });

  it("still marks it when the question does ask", () => {
    const q = { kind: "numeric", expected: 28, unit: "Nm", direction: "clockwise" } as const;
    const p = "What is the moment, and in which direction does the beam turn?";
    expect(gradeNumeric(q, "28 Nm", p).correct).toBe(false);
    expect(gradeNumeric(q, "28 Nm clockwise", p).correct).toBe(true);
  });

  it("marks it for the demo bank's own wording", () => {
    // Verbatim from the Moments topic page, and the reason the first version
    // of this rule was wrong: it required "state THE direction" and this says
    // "state value, unit and direction". Found by opening the page.
    const q = { kind: "numeric", expected: 28, unit: "Nm", direction: "clockwise" } as const;
    const p = "A force of 70 N turns a lever 0.4 m from the pivot P. Calculate the moment. State value, unit and direction (clockwise).";
    expect(gradeNumeric(q, "28 Nm", p).correct).toBe(false);
    expect(gradeNumeric(q, "28 Nm clockwise", p).correct).toBe(true);
  });

  it("asks for one when the question offers the choice without the noun", () => {
    const q = { kind: "numeric", expected: 8, unit: "Nm", direction: "clockwise" } as const;
    const p = "What is the moment? Is it clockwise or anticlockwise?";
    expect(gradeNumeric(q, "8 Nm", p).correct).toBe(false);
  });

  it("does not read a direction the question merely mentions as an ask", () => {
    // "A balanced body has a clockwise moment of 12 N m. What is the
    // anticlockwise moment about the pivot?" names both directions while
    // asking for neither.
    const q = { kind: "numeric", expected: 12, unit: "N m", direction: "anticlockwise" } as const;
    const p = "A balanced body has a clockwise moment of 12 N m. What is the anticlockwise moment about the pivot?";
    expect(gradeNumeric(q, "12 N m", p).correct).toBe(true);
  });

  it("keeps the old strict grading for a caller that passes no prompt", () => {
    const q = { kind: "numeric", expected: 28, unit: "Nm", direction: "clockwise" } as const;
    expect(gradeNumeric(q, "28 Nm").correct).toBe(false);
  });
});

describe("a unit has to be the whole unit", () => {
  // detectUnit was a substring test on a space-stripped string, so a wrong
  // unit that contained the right one passed. This flatters a student's
  // analytics, which is the same defect as the direction bug facing the other
  // way.
  const metres = { kind: "numeric", expected: 50, unit: "m" } as const;

  it("does not accept centimetres for metres", () => {
    expect(gradeNumeric(metres, "50 cm").details.unitOk).toBe(false);
  });

  it("does not accept millimetres for metres", () => {
    expect(gradeNumeric(metres, "50 mm").details.unitOk).toBe(false);
  });

  it("does not accept a speed for a distance", () => {
    expect(gradeNumeric(metres, "50 m/s").details.unitOk).toBe(false);
  });

  it("does not accept newton metres for newtons", () => {
    const newtons = { kind: "numeric", expected: 600, unit: "N" } as const;
    expect(gradeNumeric(newtons, "600 Nm").details.unitOk).toBe(false);
    expect(gradeNumeric(newtons, "600 N").details.unitOk).toBe(true);
    expect(gradeNumeric(newtons, "600 newtons").details.unitOk).toBe(true);
  });

  it("still reads the unit written the several ways it is written", () => {
    const nm = { kind: "numeric", expected: 8, unit: "Nm" } as const;
    for (const written of ["8 Nm", "8 N m", "8 N.m", "8 newton metres", "8 newton meters", "the answer is 8 Nm"]) {
      expect(gradeNumeric(nm, written).details.unitOk, written).toBe(true);
    }
  });

  it("reads the unit past a direction the student added", () => {
    const nm = { kind: "numeric", expected: 8, unit: "Nm" } as const;
    expect(gradeNumeric(nm, "8 Nm clockwise").details.unitOk).toBe(true);
  });

  it("reads a compound unit", () => {
    const speed = { kind: "numeric", expected: 10, unit: "m/s" } as const;
    expect(gradeNumeric(speed, "10 m/s").details.unitOk).toBe(true);
    expect(gradeNumeric(speed, "10 m").details.unitOk).toBe(false);
  });
});

describe("a tolerance of zero", () => {
  it("is read as unset rather than as exact float equality", () => {
    // Three approved questions carry tolerance:0, which asks a student's
    // answer to land on the same double as a computed expectation.
    const q = { kind: "numeric", expected: 0.30000000000000004, unit: "Nm", tolerance: 0 } as const;
    expect(gradeNumeric(q, "0.3 Nm").correct).toBe(true);
  });

  it("leaves a tolerance a teacher actually set alone", () => {
    const q = { kind: "numeric", expected: 600, unit: "N", tolerance: 5 } as const;
    expect(gradeNumeric(q, "604 N").correct).toBe(true);
    expect(gradeNumeric(q, "610 N").correct).toBe(false);
  });
});

describe("an article in a blank", () => {
  it("does not lose the mark", () => {
    // "The slope of a distance-time graph gives you ____" accepts "speed",
    // and "the speed" is the better sentence.
    const q = { kind: "fill", accept: ["speed"] } as const;
    expect(gradeFill(q, "the speed").correct).toBe(true);
    expect(gradeFill(q, "speed").correct).toBe(true);
  });

  it("works the other way, when the mark scheme is the one with the article", () => {
    const q = { kind: "fill", accept: ["a plotting compass"] } as const;
    expect(gradeFill(q, "plotting compass").correct).toBe(true);
    expect(gradeFill(q, "a plotting compass").correct).toBe(true);
  });

  it("still combines with the -ise/-ize rule", () => {
    const q = { kind: "fill", accept: ["magnetised material"] } as const;
    expect(gradeFill(q, "the magnetized material").correct).toBe(true);
  });

  it("does not make a wrong answer right", () => {
    const q = { kind: "fill", accept: ["speed"] } as const;
    expect(gradeFill(q, "the distance").correct).toBe(false);
    expect(gradeFill(q, "the").correct).toBe(false);
  });

  it("leaves a one-word answer that IS an article alone", () => {
    const q = { kind: "fill", accept: ["a"] } as const;
    expect(gradeFill(q, "a").correct).toBe(true);
  });
});

describe("a unit the question never asked for", () => {
  // Seventeen approved numeric questions carry a unit their prompt never
  // mentions. The hand-authored bank, which does want units, says so.
  const distance = { kind: "numeric", expected: 5, unit: "m" } as const;
  const silent = "How far did the person walk in the first part of the journey?";

  it("accepts the bare number", () => {
    const r = gradeNumeric(distance, "5", silent);
    expect(r.correct).toBe(true);
    expect(r.score).toBe(1);
  });

  it("does not tick a unit the student never wrote", () => {
    expect(gradeNumeric(distance, "5", silent).details.unitGraded).toBe(false);
  });

  it("still marks a unit the student DID write, and got wrong", () => {
    // A number with the wrong unit on it is not a right answer that happens to
    // be untidy — "5 cm" is a different distance.
    const r = gradeNumeric(distance, "5 cm", silent);
    expect(r.correct).toBe(false);
    expect(r.details.unitGraded).toBe(true);
  });

  it("accepts a right unit volunteered anyway", () => {
    expect(gradeNumeric(distance, "5 m", silent).correct).toBe(true);
  });

  it("is not fooled into reading prose as a unit", () => {
    // "The answer is 5" claims no unit. Reading "answer" as one would mark a
    // correct bare number wrong, which is the whole thing being fixed.
    expect(gradeNumeric(distance, "The answer is 5", silent).correct).toBe(true);
  });

  it("still shows the unit in the right answer when the value is wrong", () => {
    // Deliberately unlike direction: seeing "5 m" teaches the unit.
    expect(gradeNumeric(distance, "9", silent).correctAnswer).toBe("5 m");
  });
});

describe("a unit the question did ask for", () => {
  const force = { kind: "numeric", expected: 300, unit: "N" } as const;

  it("is required, exactly as before", () => {
    // Verbatim from the demo bank.
    const asked = "Ram (200 N) sits 1.5 m from a seesaw pivot. What weight must Shyam be at 1.0 m to balance it? (Give value + unit.)";
    expect(gradeNumeric(force, "300", asked).correct).toBe(false);
    expect(gradeNumeric(force, "300 N", asked).correct).toBe(true);
  });

  it("is required when the prompt says 'units' in the plural", () => {
    expect(gradeNumeric(force, "300", "What is the weight? State the units.").correct).toBe(false);
  });

  it("keeps the old strict behaviour for a caller that passes no prompt", () => {
    expect(gradeNumeric(force, "300").correct).toBe(false);
  });
});
