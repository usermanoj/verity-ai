import { describe, expect, it } from "vitest";
import {
  accuracy,
  byAttention,
  daysSince,
  flagsFor,
  summarise,
  MIN_FOR_RATE,
  type StudentProgress,
} from "./student-progress";

const NOW = new Date("2026-07-29T12:00:00Z").getTime();
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function student(over: Partial<StudentProgress> = {}): StudentProgress {
  return {
    id: over.id ?? "s1",
    name: over.name ?? "Ana",
    eslLevel: "intermediate",
    eslChinese: false,
    sections: ["7C"],
    attempts: 0,
    correct: 0,
    lastAttemptAt: null,
    recent: [],
    tutorMessages: 0,
    lastTutorAt: null,
    intents: {},
    ...over,
  };
}

describe("accuracy", () => {
  it("refuses to quote a rate from too little work", () => {
    // "33%" from three answers looks like a finding and is noise. A teacher
    // acting on it is acting on nothing.
    expect(accuracy({ attempts: 3, correct: 1 })).toBeNull();
    expect(accuracy({ attempts: MIN_FOR_RATE - 1, correct: 5 })).toBeNull();
  });

  it("quotes one once there is enough", () => {
    expect(accuracy({ attempts: 10, correct: 3 })).toBeCloseTo(0.3);
  });

  it("reports the real figure for our actual student", () => {
    // The audit found 3 correct of 10 — the true number the page should show,
    // against the 6/26 it was reporting with staff attempts mixed in.
    expect(accuracy({ attempts: 10, correct: 3 })).toBeCloseTo(0.3);
  });
});

describe("daysSince", () => {
  it("counts whole days", () => {
    expect(daysSince(ago(3), NOW)).toBe(3);
    expect(daysSince(ago(0), NOW)).toBe(0);
  });

  it("returns null rather than a number for missing or unparseable dates", () => {
    expect(daysSince(null, NOW)).toBeNull();
    expect(daysSince("not a date", NOW)).toBeNull();
  });
});

describe("flagsFor", () => {
  it("marks a student who has done nothing at all", () => {
    expect(flagsFor(student(), NOW)).toEqual(["not_started"]);
  });

  it("does not stack other flags onto a student who has not begun", () => {
    // Nothing else is knowable about them, and extra flags just crowd the list.
    const s = student({ lastAttemptAt: ago(30) });
    expect(flagsFor(s, NOW)).toEqual(["not_started"]);
  });

  it("separates not-started from struggling", () => {
    // Both look like zero progress; they need opposite responses from a
    // teacher. Prompting a child who is trying and failing is the wrong move.
    const trying = student({ attempts: 12, correct: 3, lastAttemptAt: ago(1) });
    expect(flagsFor(trying, NOW)).toContain("struggling");
    expect(flagsFor(trying, NOW)).not.toContain("not_started");
  });

  it("does not call a student struggling on too few answers", () => {
    const s = student({ attempts: 4, correct: 0, lastAttemptAt: ago(1) });
    expect(flagsFor(s, NOW)).not.toContain("struggling");
  });

  it("flags a week of silence, counting tutor use as activity", () => {
    expect(flagsFor(student({ attempts: 12, correct: 9, lastAttemptAt: ago(9) }), NOW)).toContain("inactive");
    // Practised long ago but asked the assistant yesterday: still active.
    const chatty = student({ attempts: 12, correct: 9, lastAttemptAt: ago(9), lastTutorAt: ago(9), tutorMessages: 3 });
    expect(flagsFor({ ...chatty, lastAttemptAt: ago(1) }, NOW)).not.toContain("inactive");
  });

  it("spots a student taking answers without ever being questioned", () => {
    // Explain and Give Example hand things over; Ask Me and Check require the
    // student to produce something. Invisible in any accuracy figure.
    const coasting = student({
      attempts: 12,
      correct: 10,
      lastAttemptAt: ago(1),
      tutorMessages: 9,
      lastTutorAt: ago(1),
      intents: { explain: 7, example: 2 },
    });
    expect(flagsFor(coasting, NOW)).toContain("answers_only");
  });

  it("does not flag a student who also answers back", () => {
    const engaged = student({
      attempts: 12,
      correct: 10,
      lastAttemptAt: ago(1),
      tutorMessages: 9,
      intents: { explain: 6, askme: 3 },
    });
    expect(flagsFor(engaged, NOW)).not.toContain("answers_only");
  });

  it("treats exactly half right as not struggling", () => {
    // The boundary is strict: 50% is the line, not below it. Flagging a child
    // who gets half right would put most of a normal class on the list, and a
    // list that includes everyone points at nobody.
    const half = student({ attempts: 20, correct: 10, lastAttemptAt: ago(1) });
    expect(flagsFor(half, NOW)).not.toContain("struggling");

    const justUnder = student({ attempts: 20, correct: 9, lastAttemptAt: ago(1) });
    expect(flagsFor(justUnder, NOW)).toContain("struggling");
  });

  it("leaves a doing-fine student unflagged", () => {
    const fine = student({ attempts: 20, correct: 17, lastAttemptAt: ago(1), tutorMessages: 4, intents: { askme: 4 } });
    expect(flagsFor(fine, NOW)).toEqual([]);
  });
});

describe("byAttention", () => {
  it("puts the struggling first and the fine last", () => {
    const list = [
      student({ id: "fine", name: "Zoe", attempts: 20, correct: 18, lastAttemptAt: ago(1) }),
      student({ id: "stuck", name: "Ana", attempts: 12, correct: 2, lastAttemptAt: ago(1) }),
      student({ id: "new", name: "Ben" }),
    ];
    expect(byAttention(list, NOW).map((s) => s.id)).toEqual(["stuck", "new", "fine"]);
  });

  it("orders equals by name so the list does not reshuffle between visits", () => {
    // A teacher reads this the same way every morning; a list that reorders
    // for no reason cannot be scanned.
    const list = [student({ id: "b", name: "Bea" }), student({ id: "a", name: "Ada" })];
    expect(byAttention(list, NOW).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("does not mutate the array it was given", () => {
    const list = [student({ id: "b", name: "Bea" }), student({ id: "a", name: "Ada" })];
    byAttention(list, NOW);
    expect(list.map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("summarise", () => {
  const cohort = [
    student({ id: "1", name: "A", attempts: 20, correct: 18, lastAttemptAt: ago(1) }),
    student({ id: "2", name: "B", attempts: 20, correct: 10, lastAttemptAt: ago(2) }),
    student({ id: "3", name: "C", attempts: 20, correct: 2, lastAttemptAt: ago(30) }),
    student({ id: "4", name: "D" }),
  ];

  it("counts the class, the active and the not-started", () => {
    const s = summarise(cohort, NOW);
    expect(s.students).toBe(4);
    expect(s.activeThisWeek).toBe(2);
    expect(s.notStarted).toBe(1);
  });

  it("uses the median, so one bad run cannot describe the class", () => {
    // Rates are 0.9, 0.5, 0.1 → median 0.5. The mean would also be 0.5 here;
    // the next test proves they part company.
    expect(summarise(cohort, NOW).medianAccuracy).toBeCloseTo(0.5);
  });

  it("is not dragged down by a single outlier the way a mean would be", () => {
    const skewed = [
      student({ id: "1", name: "A", attempts: 20, correct: 18 }),
      student({ id: "2", name: "B", attempts: 20, correct: 18 }),
      student({ id: "3", name: "C", attempts: 40, correct: 0 }),
    ];
    // Mean of the rates would be 0.6; the median says 0.9, which is the
    // truthful description of this class.
    expect(summarise(skewed, NOW).medianAccuracy).toBeCloseTo(0.9);
  });

  it("returns null accuracy rather than zero when nobody has done enough", () => {
    // Zero would read as "this class gets everything wrong".
    const early = [student({ id: "1", name: "A", attempts: 2, correct: 1 })];
    expect(summarise(early, NOW).medianAccuracy).toBeNull();
  });

  it("counts everyone carrying any flag as needing attention", () => {
    // Two, not three: student B sits at exactly 50%, and "struggling" is
    // strictly below that. See the boundary test above — where a threshold
    // lands is a decision about a real child, so it is pinned rather than
    // left to whoever next reads the comparison operator.
    expect(summarise(cohort, NOW).needAttention).toBe(2);
  });
});
