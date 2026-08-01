import { describe, expect, it } from "vitest";
import { axisTicks, readNumber, toChart, toPath, MIN_POINTS, type TopicTable } from "./table-chart";

// The two tables below are verbatim from the teacher's distance-time deck, as
// extracted at ingestion. Everything here is about one risk: drawing a graph of
// something that is not data. A grid of numbers a student cannot read is a
// missed opportunity; a confident chart of the wrong thing is a lie with axes
// on it.

const STATIONARY: TopicTable = {
  headers: ["Time in s", "Distance in m"],
  rows: [["0", "50"], ["1", "50"], ["2", "50"], ["3", "50"], ["4", "50"], ["5", "50"]],
};

// The third column is a teacher's working, not a measurement.
const CONSTANT_SPEED: TopicTable = {
  headers: ["Time in s", "Distance in m", "Speed (m/s)"],
  rows: [
    ["0", "0", "0"],
    ["1", "10", "(10-0)/(1-0) = 10m/s"],
    ["2", "20", "(20-10)/(2-1) = 10m/s"],
    ["3", "30", "(30-20)/(3-2) = 10 m/s"],
    ["4", "40", ""],
    ["5", "50", ""],
  ],
};

describe("readNumber", () => {
  it("reads the numbers a teacher actually types", () => {
    expect(readNumber("50")).toBe(50);
    expect(readNumber(" 12.5 ")).toBe(12.5);
    expect(readNumber("50 m")).toBe(50);
    expect(readNumber("1,200")).toBe(1200);
    expect(readNumber("-3")).toBe(-3);
    expect(readNumber("20%")).toBe(20);
  });

  it("refuses working, prose and blanks", () => {
    // The Speed column in the real deck. Plotting it would present a teacher's
    // arithmetic notes as a measured series.
    expect(readNumber("(10-0)/(1-0) = 10m/s")).toBeNull();
    expect(readNumber("about 50")).toBeNull();
    expect(readNumber("north")).toBeNull();
    expect(readNumber("")).toBeNull();
    expect(readNumber("  ")).toBeNull();
  });
});

describe("toChart — the real tables", () => {
  it("plots the constant-speed table, ignoring the working column", () => {
    const chart = toChart(CONSTANT_SPEED)!;
    expect(chart.x.label).toBe("Time in s");
    expect(chart.series).toHaveLength(1);
    expect(chart.series[0].label).toBe("Distance in m");
    expect(chart.series[0].values).toEqual([0, 10, 20, 30, 40, 50]);
    expect(chart.points).toBe(6);
  });

  it("plots the stationary table, where the y never changes", () => {
    // A flat line at 50 IS the lesson — an object that is not moving. Requiring
    // the y to vary would throw away the more instructive of the two graphs.
    const chart = toChart(STATIONARY)!;
    expect(chart.series[0].values).toEqual([50, 50, 50, 50, 50, 50]);
  });
});

describe("toChart — what must never become a chart", () => {
  it("refuses a vocabulary table", () => {
    expect(
      toChart({
        headers: ["Term", "Meaning"],
        rows: [["Lodestone", "a natural magnet"], ["Pivot", "the turning point"], ["Moment", "turning effect"]],
      }),
    ).toBeNull();
  });

  it("refuses a table with only one numeric column", () => {
    expect(
      toChart({ headers: ["Material", "Mass in g"], rows: [["iron", "50"], ["copper", "60"], ["steel", "70"]] }),
    ).toBeNull();
  });

  it("refuses too few rows to show a shape", () => {
    const short = { headers: ["t", "d"], rows: [["0", "0"], ["1", "10"]] };
    expect(short.rows.length).toBeLessThan(MIN_POINTS);
    expect(toChart(short)).toBeNull();
  });

  it("refuses when the x never changes", () => {
    // Six readings all at t=0 is not a graph of anything.
    expect(toChart({ headers: ["t", "d"], rows: [["0", "1"], ["0", "2"], ["0", "3"]] })).toBeNull();
  });

  it("refuses a column that is numeric for some rows and prose for others", () => {
    // Half a series drawn as a whole one is the worst outcome here: the line
    // simply stops, and nothing on the page says why.
    expect(
      toChart({ headers: ["t", "d"], rows: [["0", "0"], ["1", "10"], ["2", "roughly 20"], ["3", "30"]] }),
    ).toBeNull();
  });

  it("survives an empty or malformed table without throwing", () => {
    expect(toChart({ headers: [], rows: [] })).toBeNull();
    expect(toChart({ headers: ["a"], rows: [[]] })).toBeNull();
  });
});

describe("toPath", () => {
  it("maps a rising series across the box, with y inverted for SVG", () => {
    const p = toPath([0, 10, 20], [0, 1, 2]);
    expect(p[0]).toEqual({ x: 0, y: 1 });
    expect(p[2]).toEqual({ x: 1, y: 0 });
  });

  it("centres a flat line rather than dividing by zero", () => {
    // The stationary graph. A NaN here would render as an invisible chart with
    // no error anywhere.
    const p = toPath([50, 50, 50], [0, 1, 2]);
    expect(p.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))).toBe(true);
  });

  it("anchors the y axis at zero so a small change is not exaggerated", () => {
    // Distances of 48, 49, 50 scaled to fill the box would look like a steep
    // climb. Starting at zero is the honest picture.
    const p = toPath([48, 49, 50], [0, 1, 2]);
    expect(p[0].y).toBeGreaterThan(0.01);
  });
});

describe("axisTicks", () => {
  it("starts at zero and reaches the maximum", () => {
    const ticks = axisTicks([0, 10, 20, 30, 40, 50]);
    expect(ticks[0]).toBe(0);
    expect(ticks.at(-1)).toBe(50);
  });

  it("returns a single tick for a constant series rather than an empty axis", () => {
    expect(axisTicks([50, 50, 50])).toEqual([0, 12.5, 25, 37.5, 50]);
  });
});
