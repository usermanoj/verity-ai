import { describe, expect, it } from "vitest";
import {
  describeEngagement,
  engagement,
  mergeReading,
  type Reading,
  type ReadingRow,
} from "./reading";

// The point of this data is to tell two children apart who currently look
// identical: one who read the lesson carefully and practised nothing, and one
// who never opened it. Both show as "not started" today, and they need opposite
// things from a teacher. Most of these tests are about not confusing them.

const row = (over: Partial<ReadingRow> = {}): ReadingRow => ({
  topicId: "magnets",
  sections: [0, 1, 2],
  total: 32,
  at: "2026-08-01T10:00:00Z",
  ...over,
});

describe("mergeReading", () => {
  it("adds sittings together rather than taking the biggest", () => {
    // Monday 1-5, Tuesday 20-25. Ten sections reached. Taking the largest
    // single report would say six and call a diligent child a skimmer.
    const out = mergeReading([
      row({ sections: [0, 1, 2, 3, 4], at: "2026-08-01T10:00:00Z" }),
      row({ sections: [19, 20, 21, 22, 23], at: "2026-08-02T10:00:00Z" }),
    ]);
    expect(out[0].reached).toBe(10);
  });

  it("counts a section seen twice once", () => {
    const out = mergeReading([row({ sections: [0, 1] }), row({ sections: [1, 2] })]);
    expect(out[0].reached).toBe(3);
  });

  it("keeps lessons apart", () => {
    const out = mergeReading([row({ topicId: "a", sections: [0] }), row({ topicId: "b", sections: [0, 1] })]);
    expect(out).toHaveLength(2);
    expect(out.find((r) => r.topicId === "b")!.reached).toBe(2);
  });

  it("reports the lesson's length as it stands now", () => {
    // The teacher re-uploaded and the deck got shorter. The fraction should
    // describe the lesson that exists, not the one that did.
    const out = mergeReading([
      row({ total: 32, at: "2026-08-01T10:00:00Z" }),
      row({ total: 14, at: "2026-08-05T10:00:00Z" }),
    ]);
    expect(out[0].total).toBe(14);
  });

  it("remembers when they first opened it, whatever order the rows arrive", () => {
    const out = mergeReading([
      row({ at: "2026-08-05T10:00:00Z" }),
      row({ at: "2026-08-01T10:00:00Z" }),
    ]);
    expect(out[0].firstOpenedAt).toBe("2026-08-01T10:00:00Z");
    expect(out[0].lastOpenedAt).toBe("2026-08-05T10:00:00Z");
  });

  it("reports the furthest point one-based, as a person would say it", () => {
    expect(mergeReading([row({ sections: [0, 1, 7] })])[0].furthest).toBe(8);
  });

  it("has nothing to say about a lesson never opened", () => {
    expect(mergeReading([])).toEqual([]);
  });
});

describe("engagement", () => {
  const reading = (over: Partial<Reading> = {}): Reading => ({
    topicId: "magnets",
    reached: 20,
    total: 32,
    furthest: 20,
    firstOpenedAt: "2026-08-01T10:00:00Z",
    lastOpenedAt: "2026-08-01T10:00:00Z",
    ...over,
  });

  it("tells never-opened apart from opened-and-abandoned", () => {
    // The whole reason this data exists.
    expect(engagement(undefined, 0)).toBe("never_opened");
    expect(engagement(reading({ reached: 1 }), 0)).toBe("opened_only");
  });

  it("does not count the first card as reading", () => {
    // Section one is on screen before the child has done anything.
    expect(engagement(reading({ reached: 1 }), 0)).toBe("opened_only");
    expect(engagement(reading({ reached: 2 }), 0)).toBe("read_some");
  });

  it("names the child who read it all and practised nothing", () => {
    expect(engagement(reading({ reached: 30, total: 32 }), 0)).toBe("read_most");
  });

  it("counts practising however much they read", () => {
    expect(engagement(reading({ reached: 2 }), 5)).toBe("read_and_practised");
  });

  it("survives an answer with no reading recorded at all", () => {
    // Every attempt in this school predates the tracking. The panel must not
    // claim they never opened a lesson they demonstrably answered questions on.
    expect(engagement(undefined, 13)).toBe("read_and_practised");
  });

  it("cannot divide by a lesson with no sections", () => {
    expect(engagement(reading({ reached: 2, total: 0 }), 0)).toBe("read_some");
  });
});

describe("describeEngagement", () => {
  it("says what happened rather than passing judgement on the child", () => {
    // "Opened it and went no further" is something a teacher can ask about.
    // "Disengaged" is a conclusion nobody agreed to.
    const text = describeEngagement("opened_only", undefined);
    expect(text).toContain("went no further");
    expect(text.toLowerCase()).not.toContain("disengaged");
    expect(text.toLowerCase()).not.toContain("lazy");
  });

  it("quotes the fraction when it has one", () => {
    const r: Reading = {
      topicId: "m",
      reached: 12,
      total: 32,
      furthest: 12,
      firstOpenedAt: "x",
      lastOpenedAt: "x",
    };
    expect(describeEngagement("read_some", r)).toContain("12 of 32");
  });
});
