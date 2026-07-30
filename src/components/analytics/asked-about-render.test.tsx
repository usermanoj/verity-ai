import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AskedAboutPanel } from "./ReteachPanels";
import { UNTITLED_LESSON, type AskedAbout } from "@/lib/concept-failure";

// What a teacher actually reads, rather than what the pure functions return.
// Dropping a row changes a total on screen, and the risk of that is not in the
// arithmetic — it is in the sentence printed beside it.

const row = (over: Partial<AskedAbout>): AskedAbout => ({
  topic: "Lesson",
  presses: 0,
  students: 0,
  maxInOneSitting: 0,
  repeatedStudents: 0,
  ...over,
});

// The real data, as of the audit after migration 0031.
const REAL = [
  row({ topic: UNTITLED_LESSON, presses: 25, students: 1, maxInOneSitting: 9, repeatedStudents: 1 }),
  row({ topic: "Magnets and Electromagnets", presses: 10, students: 1, maxInOneSitting: 6, repeatedStudents: 1 }),
];

const render = (rows: AskedAbout[]) => renderToStaticMarkup(<AskedAboutPanel rows={rows} />);

describe("AskedAboutPanel", () => {
  it("does not show the unnamed lesson as a row", () => {
    const html = render(REAL);
    expect(html).not.toContain(UNTITLED_LESSON);
    expect(html).toContain("Magnets and Electromagnets");
  });

  it("accounts for the requests it dropped instead of quietly shrinking", () => {
    // The whole point of the change: 25 requests are real and are not listed,
    // and a teacher must not be left to infer that from a total.
    const html = render(REAL);
    expect(html).toContain("25 earlier requests aren’t listed");
  });

  it("says nothing about hidden requests when there are none", () => {
    const html = render([row({ topic: "Magnets and Electromagnets", presses: 10, students: 1, maxInOneSitting: 6 })]);
    expect(html).not.toContain("listed");
  });

  it("does not claim nobody asked for help when every sitting was unnamed", () => {
    // The empty state that would have been an outright lie: 25 requests exist.
    const html = render([REAL[0]]);
    expect(html).not.toContain("Nobody has asked");
    expect(html).toContain("No named lessons to show yet");
  });

  it("still says nobody asked when nobody did", () => {
    expect(render([])).toContain("Nobody has asked the assistant for help yet");
  });

  it("keeps the repeated-asking badge on a lesson that survives", () => {
    // The signal the panel exists for must not be lost to the filter.
    expect(render(REAL)).toContain("asked 3+ times in one sitting");
  });

  it("singularises one hidden request", () => {
    const html = render([
      row({ topic: UNTITLED_LESSON, presses: 1, students: 1, maxInOneSitting: 1 }),
      row({ topic: "Magnets", presses: 4, students: 1, maxInOneSitting: 4 }),
    ]);
    expect(html).toContain("1 earlier request isn’t listed");
  });
});
