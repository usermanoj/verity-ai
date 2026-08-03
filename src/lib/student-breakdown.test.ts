import { describe, expect, it } from "vitest";
import {
  MIN_PER_TOPIC,
  rank,
  standing,
  trend,
  type TopicScore,
  type Week,
} from "./student-breakdown";

// Every threshold here decides something a teacher will say to a child. The
// tests that matter are the ones about refusing to speak: a strength quoted
// from three answers, or an improvement announced from one good Friday, is
// worse than saying nothing, because a teacher acts on it.

const topic = (title: string, attempts: number, correct: number): TopicScore => ({
  topicId: title.toLowerCase(),
  title,
  attempts,
  correct,
});

describe("standing", () => {
  it("calls a well-evidenced high score a strength", () => {
    expect(standing(topic("Magnets", 10, 9))).toBe("strong");
  });

  it("calls a well-evidenced low score a weakness", () => {
    expect(standing(topic("Moments", 10, 3))).toBe("weak");
  });

  it("refuses to call anything from too few answers", () => {
    // 100% of four is the most tempting number on the page and means nothing.
    expect(standing(topic("Moments", 4, 4))).toBe("too_few");
    expect(standing(topic("Moments", 4, 0))).toBe("too_few");
  });

  it("has a middle that says it is a middle", () => {
    // 60% is neither. Forcing it into strong or weak is how a dashboard tells
    // a teacher to reteach something the child half knows.
    expect(standing(topic("Graphs", 10, 6))).toBe("mixed");
  });

  it("speaks at exactly the minimum", () => {
    expect(standing(topic("Graphs", MIN_PER_TOPIC, MIN_PER_TOPIC))).toBe("strong");
  });
});

describe("rank", () => {
  const TOPICS = [
    topic("Magnets", 12, 11), // 92% strong
    topic("Moments", 10, 2), // 20% weak
    topic("Graphs", 8, 5), // 63% mixed
    topic("Electromagnets", 10, 4), // 40% weak
    topic("Circuits", 3, 3), // too few
  ];

  it("separates what they can do from what they cannot", () => {
    const out = rank(TOPICS);
    expect(out.strengths.map((t) => t.title)).toEqual(["Magnets"]);
    expect(out.weaknesses.map((t) => t.title)).toEqual(["Moments", "Electromagnets"]);
    expect(out.mixed.map((t) => t.title)).toEqual(["Graphs"]);
    expect(out.unproven.map((t) => t.title)).toEqual(["Circuits"]);
  });

  it("leads each list with what it is read for", () => {
    // Weaknesses worst-first, to decide what to reteach. Strengths best-first,
    // to have something true to say to a child who thinks they are hopeless.
    const out = rank([topic("A", 10, 4), topic("B", 10, 1), topic("C", 10, 9), topic("D", 10, 10)]);
    expect(out.weaknesses.map((t) => t.title)).toEqual(["B", "A"]);
    expect(out.strengths.map((t) => t.title)).toEqual(["D", "C"]);
  });

  it("breaks a tie towards the better-evidenced topic", () => {
    const out = rank([topic("Thin", 6, 6), topic("Thick", 20, 20)]);
    expect(out.strengths[0].title).toBe("Thick");
  });

  it("has nothing to say about a student who has done nothing", () => {
    expect(rank([])).toEqual({ strengths: [], weaknesses: [], mixed: [], unproven: [] });
  });
});

describe("trend", () => {
  const week = (w: string, attempts: number, correct: number): Week => ({ week: w, attempts, correct });

  it("says nothing from a single week", () => {
    // The live database today has about one week of work in it. This is the
    // answer it must give, and "steady" would be a lie.
    expect(trend([week("2026-07-27", 20, 12)]).direction).toBe("too_few");
  });

  it("ignores a week too thin to mean anything", () => {
    const out = trend([week("2026-07-20", 20, 8), week("2026-07-27", 2, 2)]);
    expect(out.direction).toBe("too_few");
    expect(out.weeksCompared).toBe(1);
  });

  it("sees a child getting better", () => {
    const out = trend([week("2026-07-06", 10, 3), week("2026-07-13", 10, 4), week("2026-07-20", 10, 8), week("2026-07-27", 10, 9)]);
    expect(out.direction).toBe("improving");
    expect(out.before).toBeCloseTo(0.35);
    expect(out.after).toBeCloseTo(0.85);
  });

  it("sees a child slipping", () => {
    const out = trend([week("2026-07-13", 10, 9), week("2026-07-27", 10, 4)]);
    expect(out.direction).toBe("slipping");
  });

  it("does not call four points a change", () => {
    // A dashboard that announces noise as improvement teaches a teacher to
    // stop reading it.
    expect(trend([week("2026-07-13", 25, 15), week("2026-07-27", 25, 16)]).direction).toBe("steady");
  });

  it("gives the odd week to the later half", () => {
    // The most recent work must never be the part left over.
    const out = trend([week("2026-07-06", 10, 2), week("2026-07-13", 10, 9), week("2026-07-20", 10, 9)]);
    expect(out.before).toBeCloseTo(0.2);
    expect(out.after).toBeCloseTo(0.9);
  });

  it("reads weeks in order however they arrive", () => {
    const shuffled = [week("2026-07-27", 10, 9), week("2026-07-06", 10, 2)];
    expect(trend(shuffled).direction).toBe("improving");
  });
});
