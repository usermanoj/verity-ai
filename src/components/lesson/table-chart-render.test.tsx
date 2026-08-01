import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TableChart from "./TableChart";
import type { TopicTable } from "@/lib/visuals/table-chart";

// Rendering, not just detection. The decision "is this a chart" is tested next
// door; this checks that a yes produces a graph and a no produces NOTHING —
// not an empty box, not a caption with no picture, not axes around a
// vocabulary list.

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

const VOCAB: TopicTable = {
  headers: ["Term", "Meaning"],
  rows: [["Lodestone", "a natural magnet"], ["Pivot", "the turning point"], ["Moment", "turning effect"]],
};

const render = (table: TopicTable) => renderToStaticMarkup(<TableChart table={table} />);

describe("TableChart", () => {
  it("draws the teacher's own data", () => {
    const html = render(CONSTANT_SPEED);
    expect(html).toContain("<svg");
    expect(html).toContain("Distance in m");
    expect(html).toContain("Time in s");
  });

  it("renders absolutely nothing for a table that is not data", () => {
    // The important one. A chart frame with no line, or a caption above an
    // empty box, is worse than the table the student already had.
    expect(render(VOCAB)).toBe("");
  });

  it("names the axes for a screen reader", () => {
    // A graph is the one part of a lesson that is pure image. Without this a
    // student using a reader gets "graphic" and nothing else.
    expect(render(CONSTANT_SPEED)).toContain('aria-label="Distance in m against Time in s"');
  });

  it("leaves the working column out of the picture", () => {
    // Two series would be drawn if the Speed column were treated as data, and
    // the second would be a teacher's arithmetic notes plotted as measurements.
    const html = render(CONSTANT_SPEED);
    expect(html).not.toContain("Speed (m/s)");
  });

  it("does not throw on a flat series", () => {
    // The stationary-object graph divides by zero if the span is not guarded,
    // and an SVG full of NaN renders as a silent blank.
    const flat: TopicTable = {
      headers: ["Time in s", "Distance in m"],
      rows: [["0", "50"], ["1", "50"], ["2", "50"], ["3", "50"]],
    };
    const html = render(flat);
    expect(html).toContain("<svg");
    expect(html).not.toContain("NaN");
  });
});
