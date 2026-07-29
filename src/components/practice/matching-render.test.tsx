import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MatchingInput } from "./PracticeZone";

// The exact question from the screenshot.
const PAIRS = [
  { left: "lodestone", right: "natural magnet made of the iron mineral magnetite" },
  { left: "magnetite", right: "iron mineral used to make lodestones" },
  { left: "Sushruta", right: "Indian surgeon who used magnets for surgical purposes" },
  { left: "compass", right: "used for navigation" },
] as const;

const render = (value = "") =>
  renderToStaticMarkup(<MatchingInput pairs={PAIRS} value={value} onChange={() => {}} />);

describe("MatchingInput layout", () => {
  it("puts every row in ONE grid, not a grid per row", () => {
    // Columns can only line up if they belong to the same grid. A grid per
    // row measures the term column separately on each line, which is what
    // made the dropdowns step in and out down the page.
    const html = render();
    expect(html.match(/class="[^"]*\bgrid\b[^"]*"/g)?.length).toBe(1);
  });

  it("sizes the term column to its content so all selects start together", () => {
    expect(render()).toContain("grid-cols-[max-content_1fr]");
  });

  it("makes every select fill its column, so they share a width", () => {
    const html = render();
    const selects = html.match(/<select[^>]*>/g) ?? [];
    expect(selects).toHaveLength(4);
    for (const s of selects) expect(s).toContain("w-full");
  });
});

describe("MatchingInput surface", () => {
  it("uses the same input surface as every other field in the app", () => {
    // bg-black/20 + ring, matching the fill-in-the-blank input in this same
    // component, the tutor box, and the teacher Language screen.
    const html = render();
    expect(html).toContain("bg-black/20");
    expect(html).toContain("ring-[var(--border)]");
  });

  it("no longer carries the one-off lighter panel colour", () => {
    // #131a33 read as a second surface floating on the card.
    expect(render()).not.toContain("#131a33");
  });

  it("keeps an explicit dark background on options for Windows Chrome", () => {
    // Without it the native dropdown list renders on white.
    expect(render()).toContain("bg-[#0e1530]");
  });
});
