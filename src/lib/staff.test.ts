import { describe, expect, it } from "vitest";
import { canInvite, canRevoke, invitableRoles, normaliseEmail, STAFF_ROLES } from "./staff";

// Every case here is about who can grant an adult access to children's
// transcripts. The negative cases matter more than the positive ones: a missing
// permission is reported the moment someone needs it, and an extra one is not
// reported at all.

describe("invitableRoles", () => {
  it("lets a principal appoint anyone", () => {
    expect(invitableRoles("principal")).toEqual(STAFF_ROLES);
  });

  it("lets an HOD bring in teachers only", () => {
    // The delegation a school actually uses, and the reason it stops there: an
    // HOD who could create another HOD could manufacture a peer with authority
    // over them.
    expect(invitableRoles("hod")).toEqual(["teacher"]);
  });

  it("gives a teacher nobody", () => {
    expect(invitableRoles("teacher")).toEqual([]);
  });

  it("gives a student nobody", () => {
    expect(invitableRoles("student")).toEqual([]);
  });
});

describe("canInvite", () => {
  it("stops an HOD promoting someone to HOD or principal", () => {
    expect(canInvite("hod", "teacher")).toBe(true);
    expect(canInvite("hod", "hod")).toBe(false);
    expect(canInvite("hod", "principal")).toBe(false);
  });

  it("stops a teacher inviting anyone at all", () => {
    for (const role of STAFF_ROLES) expect(canInvite("teacher", role)).toBe(false);
  });

  it("rejects a role that is not a staff role", () => {
    // "student" is a real role and must not be grantable through this path —
    // the allowlist means staff, and a student row here would be meaningless
    // at best.
    expect(canInvite("principal", "student")).toBe(false);
    expect(canInvite("principal", "admin")).toBe(false);
    expect(canInvite("principal", "")).toBe(false);
  });
});

describe("canRevoke", () => {
  const grant = (over: Partial<{ role: string; source: string; isSelf: boolean }> = {}) => ({
    role: "teacher",
    source: "invite",
    isSelf: false,
    ...over,
  });

  it("lets a principal withdraw any invited grant", () => {
    for (const role of STAFF_ROLES) expect(canRevoke("principal", grant({ role }))).toBe(true);
  });

  it("lets an HOD withdraw a teacher but not a peer or a principal", () => {
    // Otherwise the invite rules are pointless: you could not create an HOD but
    // you could delete every one of them.
    expect(canRevoke("hod", grant({ role: "teacher" }))).toBe(true);
    expect(canRevoke("hod", grant({ role: "hod" }))).toBe(false);
    expect(canRevoke("hod", grant({ role: "principal" }))).toBe(false);
  });

  it("never lets anyone withdraw their own access", () => {
    // A principal who does this locks the school out of its own staff list, and
    // the way back is an env var and a redeploy.
    expect(canRevoke("principal", grant({ isSelf: true, role: "principal" }))).toBe(false);
    expect(canRevoke("hod", grant({ isSelf: true, role: "teacher" }))).toBe(false);
  });

  it("refuses a bootstrap grant rather than pretending", () => {
    // It lives in an environment variable. Marking the row would look like it
    // worked and be undone at their next sign-in — and a control that silently
    // does nothing is how people come to believe access was removed.
    expect(canRevoke("principal", grant({ source: "bootstrap", role: "principal" }))).toBe(false);
  });

  it("gives a teacher no power to withdraw anything", () => {
    expect(canRevoke("teacher", grant())).toBe(false);
    expect(canRevoke("student", grant())).toBe(false);
  });

  it("checks self before role, so a principal cannot remove themselves", () => {
    // Ordering matters: the principal branch returns true for everything, so if
    // it ran first the self-check would never be reached.
    expect(canRevoke("principal", grant({ isSelf: true }))).toBe(false);
  });
});

describe("normaliseEmail", () => {
  it("lowercases and trims, because the allowlist is matched on that", () => {
    // The auth callback looks up a lowercased address. An invitation stored with
    // a capital letter would simply never match, and would look like a person
    // who "was invited but it didn't work".
    expect(normaliseEmail("  Ana.Lim@School.edu.SG ")).toBe("ana.lim@school.edu.sg");
  });

  it("rejects what could not be an address", () => {
    for (const bad of ["", "  ", "ana", "ana@", "@school.edu", "ana@school", "a b@c.de"]) {
      expect(normaliseEmail(bad)).toBeNull();
    }
  });

  it("accepts the awkward but legitimate", () => {
    // Deliberately loose. A wrong rejection is a real teacher who cannot be
    // added; a wrong acceptance is a row that never matches anyone.
    expect(normaliseEmail("first.last+physics@sub.school.edu.sg")).toBe("first.last+physics@sub.school.edu.sg");
    expect(normaliseEmail("o'brien@school.ie")).toBe("o'brien@school.ie");
  });

  it("rejects an absurdly long address rather than storing it", () => {
    expect(normaliseEmail(`${"a".repeat(250)}@school.edu`)).toBeNull();
  });
});
