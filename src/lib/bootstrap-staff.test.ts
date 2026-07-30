import { describe, expect, it } from "vitest";
import { bootstrapConfigNote, bootstrapPrincipals, isBootstrapPrincipal } from "./bootstrap-staff";

// This variable is typed into a Vercel dashboard field by a person, and it is
// the only thing standing between "a school can appoint its first principal"
// and "somebody has to open the SQL editor". Every case below is a way that
// typing goes slightly wrong, where the cost of being strict is a deployment
// where nobody can sign in as staff and nothing says why.

describe("bootstrapPrincipals", () => {
  it("reads a single address", () => {
    expect(bootstrapPrincipals("head@school.edu.sg")).toEqual(new Set(["head@school.edu.sg"]));
  });

  it("reads a list, forgiving the spaces a person types after commas", () => {
    expect(bootstrapPrincipals("a@x.edu, b@y.edu ,c@z.edu")).toEqual(new Set(["a@x.edu", "b@y.edu", "c@z.edu"]));
  });

  it("lowercases, because the allowlist and the callback both match lowercased", () => {
    // An address entered with a capital would simply never match, and would
    // look like the bootstrap "not working" with nothing to point at.
    expect(bootstrapPrincipals("Head@School.Edu.SG")).toEqual(new Set(["head@school.edu.sg"]));
  });

  it("survives a trailing comma and empty entries", () => {
    expect(bootstrapPrincipals("a@x.edu,,b@y.edu,")).toEqual(new Set(["a@x.edu", "b@y.edu"]));
  });

  it("is empty when unset or blank, rather than matching everyone", () => {
    // The failure that matters: a bug making this match any address would hand
    // principal to every person who signed in.
    expect(bootstrapPrincipals(undefined).size).toBe(0);
    expect(bootstrapPrincipals("").size).toBe(0);
    expect(bootstrapPrincipals("   ").size).toBe(0);
    expect(bootstrapPrincipals(",,,").size).toBe(0);
  });

  it("ignores an entry that is not an address", () => {
    // Someone pasting a name or a note alongside the addresses must not create
    // an entry that could collide with something.
    expect(bootstrapPrincipals("the head teacher, head@school.edu.sg")).toEqual(new Set(["head@school.edu.sg"]));
  });
});

describe("isBootstrapPrincipal", () => {
  const LIST = "head@school.edu.sg, deputy@school.edu.sg";

  it("matches regardless of the casing the identity provider returns", () => {
    expect(isBootstrapPrincipal("Head@School.edu.SG", LIST)).toBe(true);
  });

  it("does not match anyone else", () => {
    expect(isBootstrapPrincipal("student@school.edu.sg", LIST)).toBe(false);
  });

  it("does not match on a partial address", () => {
    // Substring matching here would be a privilege-escalation bug: an attacker
    // controlling head@school.edu.sg.evil.com would become principal.
    expect(isBootstrapPrincipal("head@school.edu.sg.evil.com", LIST)).toBe(false);
    expect(isBootstrapPrincipal("head@school.edu", LIST)).toBe(false);
  });

  it("is false for a missing email rather than throwing", () => {
    // An identity provider that returns no email must not take down sign-in.
    expect(isBootstrapPrincipal(null, LIST)).toBe(false);
  });

  it("grants nobody when the variable is unset", () => {
    expect(isBootstrapPrincipal("head@school.edu.sg", "")).toBe(false);
  });
});

describe("quotes and other things a dashboard field does to a value", () => {
  it("strips surrounding quotes", () => {
    // The failure that actually happened: a quoted value still contains an @,
    // so it passes every check and matches nobody. Silent, and identical in
    // appearance to the feature not working.
    expect(bootstrapPrincipals('"head@school.edu"')).toEqual(new Set(["head@school.edu"]));
    expect(bootstrapPrincipals("'head@school.edu'")).toEqual(new Set(["head@school.edu"]));
    expect(isBootstrapPrincipal("head@school.edu", '"head@school.edu"')).toBe(true);
  });

  it("strips quotes around each entry in a list", () => {
    expect(bootstrapPrincipals('"a@x.edu", "b@y.edu"')).toEqual(new Set(["a@x.edu", "b@y.edu"]));
  });
});

describe("bootstrapConfigNote", () => {
  it("says nothing when the value is usable", () => {
    expect(bootstrapConfigNote("head@school.edu")).toBeNull();
  });

  it("distinguishes unset from set-but-useless", () => {
    // Two different problems with two different fixes: one is "you haven't set
    // it", the other is "you set it and it says nothing".
    expect(bootstrapConfigNote(undefined)).toMatch(/not set/);
    expect(bootstrapConfigNote("")).toMatch(/no usable address/);
    expect(bootstrapConfigNote("the head teacher")).toMatch(/no usable address/);
  });
});
