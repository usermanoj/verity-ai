import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import StrengthsPanel from "./StrengthsPanel";
import type { TopicScore, Week } from "@/lib/student-breakdown";
import type { ReadingRow } from "@/lib/reading";

// The arithmetic is tested next door. This checks the thing arithmetic tests
// cannot: that the screen refuses to make a claim it does not have the evidence
// for. A teacher acts on what this panel says.

const topics: TopicScore[] = [
  { topicId: "a", title: "Magnets and Electromagnets", attempts: 12, correct: 11 },
  { topicId: "b", title: "Grade 7 physics Moments of force", attempts: 10, correct: 2 },
  { topicId: "c", title: "4-Distance time graph", attempts: 3, correct: 3 },
];

const render = (t: TopicScore[], w: Week[] = [], r: ReadingRow[] = []) =>
  renderToStaticMarkup(<StrengthsPanel topics={t} weekly={w} reading={r} />);

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
    // Now that reading is tracked, "answered nothing" is no longer the
    // whole story, and the empty state says so.
    expect(render([])).toContain("haven&#x27;t opened a lesson or answered anything");
  });
});

describe("reading beside answering", () => {
  const readOf = (sections: number[], total = 32): ReadingRow[] => [
    { topicId: "a", sections, total, at: "2026-08-03T10:00:00Z" },
  ];

  it("tells the teacher a lesson was read but not practised", () => {
    // The finding this data exists for. Before it, this child and one who
    // never opened the page were the same row.
    const html = render(
      [{ topicId: "a", title: "Magnets and Electromagnets", attempts: 0, correct: 0 }],
      [],
      readOf(Array.from({ length: 30 }, (_, i) => i)),
    );
    expect(html).toContain("30/32 sections");
    expect(html).toContain("hasn&#x27;t practised");
  });

  it("does not count opening the page as reading it", () => {
    const html = render([{ topicId: "a", title: "Magnets", attempts: 0, correct: 0 }], [], readOf([0]));
    expect(html).toContain("went no further");
  });

  it("says nothing rather than claiming a child read nothing", () => {
    // Every attempt in this school predates the tracking. "No reading
    // recorded" and "read nothing" are different sentences and only one of
    // them is true here.
    const html = render([{ topicId: "a", title: "Magnets", attempts: 13, correct: 4 }]);
    expect(html).toContain("No reading recorded yet");
    expect(html).not.toContain("Hasn&#x27;t opened");
  });

  it("never reports how long they spent", () => {
    const html = render(
      [{ topicId: "a", title: "Magnets", attempts: 0, correct: 0 }],
      [],
      readOf([0, 1, 2, 3, 4]),
    );
    for (const word of ["minute", "second", "hour", "spent", "duration"]) {
      expect(html.toLowerCase()).not.toContain(word);
    }
  });
});
