import { describe, expect, it } from "vitest";
import { atLeast, isStaff, ROLE_RANK } from "./roles";
import { withBootstrapPrincipals, type StaffGrant } from "./staff-repo";

// Seniority decides who may open a page and call an endpoint. The negative
// cases are the ones that matter: a missing permission gets reported the moment
// someone needs it, an extra one never does.

describe("atLeast", () => {
  it("lets a senior role through a junior gate", () => {
    // The bug this fixes: a principal turned away from a teacher's page for not
    // being a teacher.
    expect(atLeast("principal", "teacher")).toBe(true);
    expect(atLeast("hod", "teacher")).toBe(true);
  });

  it("does not let a junior role through a senior gate", () => {
    expect(atLeast("teacher", "hod")).toBe(false);
    expect(atLeast("teacher", "principal")).toBe(false);
    expect(atLeast("hod", "principal")).toBe(false);
  });

  it("keeps students out of every staff gate", () => {
    for (const gate of ["teacher", "hod", "principal"] as const) {
      expect(atLeast("student", gate)).toBe(false);
    }
  });

  it("is satisfied by the exact role", () => {
    for (const role of Object.keys(ROLE_RANK) as (keyof typeof ROLE_RANK)[]) {
      expect(atLeast(role, role)).toBe(true);
    }
  });

  it("refuses an unknown, empty or missing role rather than guessing a rank", () => {
    // Guessing here means an unauthorised adult reading children's work. A role
    // string this code does not recognise is a reason to say no.
    expect(atLeast("admin", "teacher")).toBe(false);
    expect(atLeast("", "teacher")).toBe(false);
    expect(atLeast(null, "teacher")).toBe(false);
    expect(atLeast(undefined, "teacher")).toBe(false);
    expect(atLeast("Teacher", "teacher")).toBe(false);
  });
});

describe("isStaff", () => {
  it("is teachers and above, never students", () => {
    expect(isStaff("teacher")).toBe(true);
    expect(isStaff("hod")).toBe(true);
    expect(isStaff("principal")).toBe(true);
    expect(isStaff("student")).toBe(false);
    expect(isStaff(null)).toBe(false);
  });
});

describe("withBootstrapPrincipals", () => {
  const grant = (over: Partial<StaffGrant>): StaffGrant => ({
    email: "teacher@school.edu",
    role: "teacher",
    source: "invite",
    invitedAt: "2026-01-01",
    invitedBy: "Head",
    claimedAt: "2026-01-02",
    claimedName: "A Teacher",
    revokedAt: null,
    revokedBy: null,
    isSelf: false,
    ...over,
  });

  it("shows an env-var principal who has no row at all", () => {
    // A brand-new school's first principal. Omitting them would make the staff
    // page lie about who can see children's work.
    const out = withBootstrapPrincipals([], "head@school.edu");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ email: "head@school.edu", role: "principal", source: "bootstrap" });
  });

  it("keeps an existing row's history while showing the role they operate at", () => {
    // Their invitation, who issued it and when it was taken up are all still
    // true and still worth showing.
    const out = withBootstrapPrincipals([grant({ email: "head@school.edu" })], "head@school.edu");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      role: "principal",
      source: "bootstrap",
      invitedBy: "Head",
      claimedName: "A Teacher",
    });
  });

  it("does not duplicate someone who is both in the table and in the variable", () => {
    const out = withBootstrapPrincipals([grant({ email: "head@school.edu" })], "head@school.edu");
    expect(out.filter((g) => g.email === "head@school.edu")).toHaveLength(1);
  });

  it("matches regardless of casing on either side", () => {
    const out = withBootstrapPrincipals([grant({ email: "Head@School.edu" })], "head@school.edu");
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("bootstrap");
  });

  it("leaves everyone else exactly as they were", () => {
    const others = [grant({ email: "a@school.edu" }), grant({ email: "b@school.edu", role: "hod" })];
    const out = withBootstrapPrincipals(others, "head@school.edu");
    expect(out.slice(0, 2)).toEqual(others);
  });

  it("un-revokes a bootstrap principal, because the variable outranks the row", () => {
    // Otherwise the page would show them as removed while they are signing in
    // as principal — the row cannot overrule the environment.
    const out = withBootstrapPrincipals(
      [grant({ email: "head@school.edu", revokedAt: "2026-02-01", revokedBy: "Someone" })],
      "head@school.edu",
    );
    expect(out[0].revokedAt).toBeNull();
  });

  it("changes nothing when the variable is unset", () => {
    const rows = [grant({})];
    expect(withBootstrapPrincipals(rows, "")).toEqual(rows);
    expect(withBootstrapPrincipals(rows, undefined)).toBe(rows);
  });
});
