import { describe, expect, it } from "vitest";
import { detectTable } from "./LessonSections";

// A wrong table is worse than no table — a student would read fabricated
// pairings as data. These tests pin the detector to the shape it is meant to
// catch and prove it declines everything else.
describe("detectTable", () => {
  it("recovers a two-column table flattened by PPTX extraction", () => {
    const table = detectTable("Time in s Distance in m 0 50 1 50 2 50 3 50");
    expect(table).not.toBeNull();
    expect(table!.headers).toEqual(["Time in s", "Distance in m"]);
    expect(table!.rows).toEqual([
      ["0", "50"],
      ["1", "50"],
      ["2", "50"],
      ["3", "50"],
    ]);
  });

  it("keeps surrounding prose so no content is dropped", () => {
    const table = detectTable("A car is stationary. Time in s Distance in m 0 50 1 50 2 50 3 50 The graph is flat.");
    expect(table!.rest).toContain("A car is stationary.");
    expect(table!.rest).toContain("The graph is flat.");
  });

  it("declines an odd number of values rather than mispairing them", () => {
    expect(detectTable("Time in s Distance in m 0 50 1 50 2")).toBeNull();
  });

  it("declines ordinary prose that merely contains numbers", () => {
    expect(detectTable("The moment is 12 Nm when the force is 4 N at 3 m from the pivot.")).toBeNull();
  });

  it("declines a heading pair with too few readings to be a table", () => {
    expect(detectTable("Time in s Distance in m 0 50")).toBeNull();
  });
});
