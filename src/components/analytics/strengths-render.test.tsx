import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import StrengthsPanel from "./StrengthsPanel";
import type { TopicScore, Week } from "@/lib/student-breakdown";

// The arithmetic is tested next door. This checks the thing arithmetic tests
// cannot: that the screen refuses to make a claim it does not have the evidence
// for. A teacher acts on what this panel says.

const topics: TopicScore[] = [
  { topicId: "a", title: "Magnets and Electromagnets", attempts: 12, correct: 11 },
  { topicId: "b", title: "Grade 7 physics Moments of force", attempts: 10, correct: 2 },
  { topicId: "c", title: "4-Distance time graph", attempts: 3, correct: 3 },
];

const render = (t: TopicScore[], w: Week[] = []) =>
  renderToStaticMarkup(<StrengthsPanel topics={t} weekly={w} />);

describe("StrengthsPanel", () => {
  it("names what the child is good at, not only what they failed", () => {
    const html = render(topics);
    expect(html).toContain("Strong");
    expect(html).toContain("Magnets and Electromagnets");
    expect(html).toContain("11/12");
  });

  it("names what to reteach", () => {
    const html = render(topics);
    expect(html).toContain("Needs reteaching");
    expect(html).toContain("Grade 7 physics Moments of force");
  });

  it("will not call three right answers a strength", () => {
    // The most tempting number on the page. It appears, but under "too few to
    // judge" — hiding it would read as a topic the child never touched.
    const html = render(topics);
    expect(html).toContain("Too few answers to judge");
    expect(html).toContain("4-Distance time graph (3)");
  });

  it("says nothing about a trend it cannot see", () => {
    // One week is what the live database holds today.
    const html = render(topics, [{ week: "2026-07-27", attempts: 20, correct: 12 }]);
    expect(html).toContain("no comparison yet");
    expect(html).not.toContain("Improving");
  });

  it("reports real improvement with the two figures behind it", () => {
    const html = render(topics, [
      { week: "2026-07-13", attempts: 10, correct: 3 },
      { week: "2026-07-27", attempts: 10, correct: 9 },
    ]);
    expect(html).toContain("Improving");
    expect(html).toContain("30%");
    expect(html).toContain("90%");
  });

  it("has an honest empty state", () => {
    expect(render([])).toContain("haven&#x27;t answered anything");
  });
});
