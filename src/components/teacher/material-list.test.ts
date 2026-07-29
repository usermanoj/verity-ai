import { describe, expect, it } from "vitest";
import { relativeTime } from "./MaterialList";

// Fixed instant: Date.now() is stamped once on the server and passed in, so
// every row measures against the same moment and none of this is ambient.
const NOW = new Date("2026-07-29T12:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("says 'just now' for an upload that has only this second finished", () => {
    // The whole point of the column: answering "is this the one I just did?".
    expect(relativeTime(ago(5_000), NOW)).toBe("just now");
  });

  it("counts minutes within the hour", () => {
    expect(relativeTime(ago(2 * MIN), NOW)).toBe("2 min ago");
    expect(relativeTime(ago(45 * MIN), NOW)).toBe("45 min ago");
  });

  it("switches to hours, singular and plural", () => {
    expect(relativeTime(ago(HOUR), NOW)).toBe("1 hour ago");
    expect(relativeTime(ago(5 * HOUR), NOW)).toBe("5 hours ago");
  });

  it("switches to days within the week", () => {
    expect(relativeTime(ago(DAY), NOW)).toBe("1 day ago");
    expect(relativeTime(ago(3 * DAY), NOW)).toBe("3 days ago");
  });

  it("falls back to a date once relative time stops being useful", () => {
    // "37 days ago" tells a teacher nothing they can act on.
    const out = relativeTime(ago(40 * DAY), NOW);
    expect(out).not.toMatch(/ago/);
    expect(out.length).toBeGreaterThan(0);
  });

  it("returns empty rather than 'NaN ago' for an unparseable timestamp", () => {
    expect(relativeTime("not a date", NOW)).toBe("");
  });
});
