import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionCoverage } from "./IngestPanel";
import type { TeacherChunk } from "@/lib/ingestion/documents";

// A sixty-section deck gets questions for forty of its sections and none for
// the other twenty, and the panel looked exactly the same either way.
// Measured on a seeded sixty-section deck; see scripts/audit-deck-scale.mts.
//
// Tested directly rather than through IngestPanel: the chunk list only renders
// once a teacher expands a deck, so a server-rendered panel contains none of
// this. The first version of this file went through the panel and its
// "says nothing when every section is covered" case passed for that reason —
// nothing was rendered, so nothing was found, and the assertion proved only
// that the test could not see its own subject.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const chunk = (i: number, questions: number): TeacherChunk => ({
  id: `c${i}`,
  heading: `Section ${i}`,
  text: `Body of section ${i}`,
  citation: `deck.pptx — Page/Section ${i}`,
  questions: Array.from({ length: questions }, (_, j) => ({
    id: `c${i}-q${j}`,
    level: "Easy" as const,
    prompt: `Question ${j} for section ${i}`,
    question: { kind: "fill", accept: ["poles"] } as unknown as Record<string, unknown>,
    status: "approved" as const,
  })),
});

const render = (chunks: TeacherChunk[]) => renderToStaticMarkup(<QuestionCoverage chunks={chunks} />);

describe("a deck the generator did not finish", () => {
  it("says how many sections were left without questions", () => {
    // 60 sections with the first 40 covered — exactly what the cap produces.
    const html = render(Array.from({ length: 60 }, (_, i) => chunk(i, i < 40 ? 7 : 0)));
    expect(html).toContain("40 of 60 sections have practice questions");
    expect(html).toContain("20 sections have none");
  });

  it("points at the way to fix it", () => {
    // Naming a gap without naming the remedy just worries a teacher.
    const html = render(Array.from({ length: 60 }, (_, i) => chunk(i, i < 40 ? 7 : 0)));
    expect(html).toContain("Generate practice questions");
  });

  it("uses the singular for one missing section", () => {
    const html = render([chunk(0, 7), chunk(1, 7), chunk(2, 0)]);
    expect(html).toContain("2 of 3 sections have practice questions");
    expect(html).toContain("1 section has none");
  });

  it("renders nothing at all when every section is covered", () => {
    // The normal case. A banner on every deck is a banner nobody reads — and
    // this asserts on the empty string rather than on a missing substring, so
    // it cannot pass by rendering nothing for the wrong reason.
    expect(render(Array.from({ length: 12 }, (_, i) => chunk(i, 7)))).toBe("");
  });

  it("renders nothing for a deck with no sections yet", () => {
    expect(render([])).toBe("");
  });
});
