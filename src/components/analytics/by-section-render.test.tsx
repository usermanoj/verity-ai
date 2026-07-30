import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TeacherLearningPanels } from "./LearningPanels";
import type { TeacherLearning } from "@/lib/analytics";

// The section rows add up to the total only because an answer that could belong
// to two sections is counted in one. That is a choice, and a teacher reading a
// column of numbers is owed the sentence explaining it — otherwise the honest
// version of the arithmetic is indistinguishable from the double-counting bug
// it replaced.

const base = (over: Partial<TeacherLearning> = {}): TeacherLearning => ({
  overall: { attempts: 13, correct: 4, studentsEnrolled: 1, studentsActive: 1 },
  bySection: [
    { section: "7C", subject: "Physics", grade: "Grade 7", attempts: 13, correct: 4, enrolled: 1, active: 1 },
    { section: "7D", subject: "Physics", grade: "Grade 7", attempts: 0, correct: 0, enrolled: 1, active: 0 },
  ],
  sharedStudents: [],
  hardestTopics: [],
  students: [],
  assistant: { studentsUsing: 1, intents: [], shortcutting: 0 },
  ...over,
});

const render = (data: TeacherLearning) => renderToStaticMarkup(<TeacherLearningPanels data={data} />);

describe("By section — explaining the arithmetic", () => {
  it("says nothing when no student is in two sections", () => {
    // The ordinary case. A footnote about an overlap that does not exist is
    // noise on every other school's screen.
    expect(render(base())).not.toContain("counted once");
  });

  it("names the student and their sections when there is an overlap", () => {
    const html = render(base({ sharedStudents: [{ name: "Ana Lim", sections: ["7C", "7D"] }] }));
    expect(html).toContain("Ana Lim is in 7C and 7D");
    expect(html).toContain("counted once");
  });

  it("agrees with itself for one student and for several", () => {
    // "receives" against "receive" — the sort of thing that ships wrong and
    // reads as carelessness on a page about somebody's child.
    expect(render(base({ sharedStudents: [{ name: "Ana", sections: ["7C", "7D"] }] }))).toContain("and receives");
    const two = render(
      base({
        sharedStudents: [
          { name: "Ana", sections: ["7C", "7D"] },
          { name: "Ben", sections: ["7A", "7B"] },
        ],
      }),
    );
    expect(two).toContain("and receive");
    expect(two).toContain("Ben is in 7A and 7B");
  });

  it("survives a payload from before the migration, where the field is absent", () => {
    // The page deploys before the migration runs. `.length` on undefined would
    // take down the whole panel to explain a footnote.
    // Built without the field rather than deleted from a copy: `delete` needs
    // the property to be optional, and widening the type to make it optional
    // would weaken the very type this guards.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sharedStudents, ...stale } = base();
    expect(() => render(stale as TeacherLearning)).not.toThrow();
    expect(render(stale as TeacherLearning)).toContain("7C");
  });
});
