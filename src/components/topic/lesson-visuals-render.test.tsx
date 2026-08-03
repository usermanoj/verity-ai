import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LessonSections from "./LessonSections";
import type { CorpusChunk } from "@/data/corpus";
import type { VisualOverride } from "@/lib/visuals/resolve";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

// The resolver is tested next door on plain data. This checks the wiring: that
// a teacher's decision actually changes what the lesson renders, and that the
// three states stay three — "moved it", "hid it" and "never touched it" must
// not collapse into each other somewhere between the database and the page.

const LEVER = "A beam on a pivot with a weight on each side";

const chunk = (id: string, heading: string, text: string): CorpusChunk => ({
  id,
  source: "Moments.pptx — Page/Section 1",
  sourceType: "slides",
  topicId: "doc-1",
  heading,
  text,
});

const CHUNKS = [
  chunk("c1", "The turning effect of a force", "The moment of a force about a pivot is force multiplied by distance."),
  chunk("c2", "Everyday levers", "A spanner makes a nut easier to turn."),
];

function render(overrides: VisualOverride[] = [], canEdit = false) {
  return renderToStaticMarkup(
    <LessonSections chunks={CHUNKS} visualOverrides={overrides} canEditVisuals={canEdit} />,
  );
}

describe("lesson visuals", () => {
  it("uses the matched visual when the teacher has said nothing", () => {
    const html = render();
    expect(html).toContain(LEVER);
    // On the section whose words earned it, not somewhere else.
    expect(html.indexOf(LEVER)).toBeLessThan(html.indexOf("Everyday levers"));
  });

  it("moves the visual to the section the teacher chose", () => {
    const html = render([
      { chunkId: "c1", visual: null },
      { chunkId: "c2", visual: "lever" },
    ]);
    expect(html.indexOf(LEVER)).toBeGreaterThan(html.indexOf("Everyday levers"));
    // And exactly once — an override must not leave the matched copy behind.
    expect(html.split(LEVER)).toHaveLength(2);
  });

  it("shows nothing where the teacher hid it", () => {
    expect(render([{ chunkId: "c1", visual: null }])).not.toContain(LEVER);
  });

  it("does not offer the picker to a reader who cannot edit", () => {
    expect(render()).not.toContain("Change");
  });

  it("offers the picker to the teacher, naming what is there now", () => {
    const html = render([], true);
    expect(html).toContain("chosen by matching");
    expect(html).toContain("Change");
  });

  it("tells the teacher when they are the reason a section is bare", () => {
    // "I turned this off" and "nothing matched" both draw no picture. If the
    // control cannot tell them apart, the teacher's decision looks like it
    // never saved.
    const html = render([{ chunkId: "c1", visual: null }], true);
    expect(html).toContain("you turned it off");
  });
});
