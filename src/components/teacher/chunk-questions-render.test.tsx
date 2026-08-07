import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ChunkQuestions from "./ChunkQuestions";
import type { TeacherChunk } from "@/lib/ingestion/documents";

// Two things a teacher could not do before this: see that a published question
// gives its own answer away, and do anything about it. The five real ones are
// still in the bank, so the fixtures are the real ones.

const chunk = (questions: TeacherChunk["questions"]): TeacherChunk => ({
  id: "c1",
  heading: "Why different magnets are made from different materials",
  text: "Permanent magnets are made from permanent magnetic materials…",
  citation: "Magnets and Electromagnets.pptx — Page/Section 12",
  questions,
});

const tautology = {
  id: "q-tautology",
  level: "Easy" as const,
  prompt: "Permanent magnets are made from ______ magnetic materials.",
  question: { kind: "fill", accept: ["permanent"] } as unknown as Record<string, unknown>,
  status: "approved" as const,
};

const fair = {
  id: "q-fair",
  level: "Medium" as const,
  prompt: "A steel bar is stroked in one direction with one pole of a ____.",
  question: { kind: "fill", accept: ["permanent magnet"] } as unknown as Record<string, unknown>,
  status: "approved" as const,
};

const render = (questions: TeacherChunk["questions"]) =>
  renderToStaticMarkup(<ChunkQuestions chunk={chunk(questions)} onChanged={() => {}} />);

describe("a published question that answers itself", () => {
  it("is flagged, and can be taken down", () => {
    // Before this, "✓ Published" was the end of the road: the teacher could
    // read the bad question and had no control to act on it.
    const html = render([tautology]);
    expect(html).toContain("appears in the question");
    expect(html).toContain("permanent");
    expect(html).toContain("Retire");
  });

  it("leaves a fair question unmarked and without a retire control", () => {
    // The warning has to be rare to be worth reading. A badge on every row is
    // a badge nobody looks at.
    const html = render([fair]);
    expect(html).not.toContain("appears in the question");
    expect(html).not.toContain("Retire");
  });
});

describe("a question still awaiting review", () => {
  it("carries the warning before the teacher decides, and no retire control", () => {
    // Catching it here is the cheap version — nothing has reached a student
    // and no answers have to stop counting.
    const html = render([{ ...tautology, id: "q-pending", status: "pending" }]);
    expect(html).toContain("appears in the question");
    expect(html).not.toContain("Retire");
  });
});

describe("a malformed row", () => {
  it("does not take the ingest panel down with it", () => {
    // One bad row on a freshly uploaded deck must not strand the upload.
    const html = render([
      { ...tautology, id: "q-null", question: null as unknown as Record<string, unknown> },
      tautology,
    ]);
    expect(html).toContain("✓ Published");
    expect(html).toContain("appears in the question");
  });
});
