import { describe, expect, it } from "vitest";
import {
  describeSpan,
  helpEffect,
  pacing,
  toSessions,
  RUSHED_MS,
  SESSION_GAP_MS,
  type TimelineEvent,
} from "./timeline";

// Every rule below is a claim about a child, shown to their teacher. The
// boundaries carry the weight: a sitting split in the wrong place turns one
// afternoon's work into two half-hearted ones, and "help worked" counted
// loosely would be evidence for the product's central claim that the product
// invented for itself.

const T0 = Date.parse("2026-07-30T14:00:00Z");
const at = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();
const atSec = (seconds: number) => new Date(T0 + seconds * 1000).toISOString();

const answer = (when: string, correct: boolean, label = "Q"): TimelineEvent => ({
  at: when, kind: "answer", correct, label, detail: "Medium", section: "Magnetic materials", intent: null,
});
const ask = (when: string, intent: string): TimelineEvent => ({
  at: when, kind: "ask", correct: null, label: "Magnets", detail: null, section: null, intent,
});

describe("toSessions", () => {
  it("keeps one afternoon's work as one sitting", () => {
    const s = toSessions([answer(at(0), true), ask(at(5), "explain"), answer(at(12), false)]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ answers: 2, correct: 1, asks: 1 });
  });

  it("splits when the gap exceeds the threshold, not when it equals it", () => {
    // The boundary decides whether a pause to read the lesson is treated as
    // leaving. Exactly at the threshold stays together.
    const exact = toSessions([answer(at(0), true), answer(new Date(T0 + SESSION_GAP_MS).toISOString(), true)]);
    expect(exact).toHaveLength(1);

    const over = toSessions([answer(at(0), true), answer(new Date(T0 + SESSION_GAP_MS + 1000).toISOString(), true)]);
    expect(over).toHaveLength(2);
  });

  it("measures the gap from the LAST action, not the first", () => {
    // A two-hour sitting with steady work is one sitting. Measuring from the
    // start would chop it into arbitrary twenty-minute pieces.
    const s = toSessions([answer(at(0), true), answer(at(15), true), answer(at(30), true), answer(at(45), true)]);
    expect(s).toHaveLength(1);
    expect(s[0].spanMs).toBe(45 * 60_000);
  });

  it("sorts before grouping, so arrival order cannot invent a sitting", () => {
    const s = toSessions([answer(at(12), false), answer(at(0), true), ask(at(5), "explain")]);
    expect(s).toHaveLength(1);
    expect(s[0].startedAt).toBe(at(0));
  });

  it("reports a span of zero for a single action rather than guessing", () => {
    // One answer tells you when, not for how long.
    expect(toSessions([answer(at(0), true)])[0].spanMs).toBe(0);
  });

  it("ignores an unparseable timestamp instead of producing NaN", () => {
    const s = toSessions([answer("not a date", true), answer(at(0), true)]);
    expect(s).toHaveLength(1);
    expect(Number.isNaN(s[0].spanMs)).toBe(false);
  });

  it("returns nothing for nothing", () => {
    expect(toSessions([])).toEqual([]);
  });
});

describe("helpEffect", () => {
  it("credits an answer that followed a request for help", () => {
    const e = helpEffect([ask(at(0), "explain"), answer(at(2), true)]);
    expect(e).toMatchObject({ helped: 1, correctAfterHelp: 1, unaided: 0 });
  });

  it("counts an answer with no preceding help as unaided", () => {
    const e = helpEffect([answer(at(0), true), answer(at(2), false)]);
    expect(e).toMatchObject({ helped: 0, unaided: 2, unaidedCorrect: 1 });
  });

  it("only lets help count once", () => {
    // One explanation does not make every later answer aided, or the measure
    // would flatter itself the more a child reads.
    const e = helpEffect([ask(at(0), "explain"), answer(at(1), true), answer(at(3), true)]);
    expect(e).toMatchObject({ helped: 1, unaided: 1 });
  });

  it("does not count help from a previous sitting", () => {
    // An explanation read last night did not help with this morning's question
    // in any sense this function can defend.
    const e = helpEffect([ask(at(0), "explain"), answer(at(45), true)]);
    expect(e).toMatchObject({ helped: 0, unaided: 1 });
  });

  it("does not treat being questioned as being helped", () => {
    // askme and check ask the student to produce something. Counting them as
    // help would turn "was tested and got it right" into "was helped".
    for (const intent of ["askme", "check"]) {
      expect(helpEffect([ask(at(0), intent), answer(at(1), true)])).toMatchObject({ helped: 0, unaided: 1 });
    }
  });

  it("counts a wrong answer after help as helped and wrong", () => {
    // The honest case. Suppressing it would make help look better than it is.
    const e = helpEffect([ask(at(0), "explain"), answer(at(1), false)]);
    expect(e).toMatchObject({ helped: 1, correctAfterHelp: 0 });
  });
});

describe("pacing", () => {
  it("reports the median gap between answers", () => {
    const e = [answer(atSec(0), true), answer(atSec(30), true), answer(atSec(90), true)];
    expect(pacing(e).medianMs).toBe(45_000);
  });

  it("counts answers given too fast to have been read", () => {
    const e = [answer(atSec(0), true), answer(atSec(5), false), answer(atSec(9), false)];
    expect(pacing(e).rushed).toBe(2);
  });

  it("does not count the boundary as rushed", () => {
    const e = [answer(atSec(0), true), answer(atSec(RUSHED_MS / 1000), true)];
    expect(pacing(e).rushed).toBe(0);
  });

  it("does not measure across a break, which would invent a huge gap", () => {
    // Two answers a day apart are not a twenty-four-hour think.
    const e = [answer(at(0), true), answer(at(60 * 24), true)];
    expect(pacing(e)).toMatchObject({ medianMs: null, measured: 0 });
  });

  it("says null rather than zero when there is nothing to measure", () => {
    // Zero would read as "answered instantly".
    expect(pacing([answer(at(0), true)])).toMatchObject({ medianMs: null, measured: 0 });
    expect(pacing([])).toMatchObject({ medianMs: null, measured: 0 });
  });

  it("counts the time spent reading an explanation as time before the answer", () => {
    // A student who asked at 0 and answered at 60 thought for a minute, and
    // the ask is what they were doing. Skipping it would report the gap from
    // the previous ANSWER and overstate the pause.
    const e = [answer(atSec(0), true), ask(atSec(30), "explain"), answer(atSec(60), true)];
    expect(pacing(e).medianMs).toBe(30_000);
  });
});

describe("describeSpan", () => {
  it("never claims precision it has not got", () => {
    // The underlying figure is the distance between two clicks. "22m 14s"
    // would be a claim about a child's attention that nobody can support.
    expect(describeSpan(30_000)).toBe("under a minute");
    expect(describeSpan(22 * 60_000 + 14_000)).toBe("22 min");
    expect(describeSpan(60 * 60_000)).toBe("1h");
    expect(describeSpan(95 * 60_000)).toBe("1h 35m");
  });
});
