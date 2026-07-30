import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TeacherTabs from "./TeacherTabs";
import { seniorHomeFor } from "@/lib/roles";

// usePathname needs a router context that server rendering has not got.
vi.mock("next/navigation", () => ({ usePathname: () => "/teacher" }));

// A principal reaching the teaching area had no route back to the school
// dashboard from any of the six tabs, and had to type the URL. For navigation
// that is the same as it not existing.

const render = (seniorHome: string | null) => renderToStaticMarkup(<TeacherTabs seniorHome={seniorHome} />);

describe("TeacherTabs — the way back", () => {
  it("offers a principal their school dashboard", () => {
    const html = render(seniorHomeFor("principal"));
    expect(html).toContain('href="/principal"');
    expect(html).toContain("School");
  });

  it("sends a head of department to their own dashboard, not the principal's", () => {
    const html = render(seniorHomeFor("hod"));
    expect(html).toContain('href="/hod"');
    expect(html).not.toContain('href="/principal"');
  });

  it("offers a plain teacher nothing, because this IS their home", () => {
    // A link back would take them to a page that redirects them straight here.
    const html = render(seniorHomeFor("teacher"));
    expect(html).not.toContain('href="/principal"');
    expect(html).not.toContain('href="/hod"');
  });

  it("still renders every tab whether or not the link is there", () => {
    // The way back must not cost anyone the way around.
    for (const seniorHome of [null, "/principal"]) {
      const html = render(seniorHome);
      for (const href of [
        "/teacher",
        "/teacher/ingest",
        "/teacher/classes",
        "/teacher/language",
        "/teacher/insights",
        "/teacher/health",
      ]) {
        expect(html).toContain(`href="${href}"`);
      }
    }
  });
});

describe("seniorHomeFor", () => {
  it("has no home above the teaching area for a teacher or a student", () => {
    expect(seniorHomeFor("teacher")).toBeNull();
    expect(seniorHomeFor("student")).toBeNull();
    expect(seniorHomeFor(null)).toBeNull();
    expect(seniorHomeFor(undefined)).toBeNull();
  });
});
