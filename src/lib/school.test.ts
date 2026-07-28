import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveSchoolId, type SchoolReader } from "./school";

// A stand-in for the service-role client that records how it was called, so
// the "don't query when it's configured" case is provable rather than assumed.
function reader(result: { data: { id: string }[] | null; error: { message: string } | null }) {
  const limit = vi.fn().mockResolvedValue(result);
  const fake = { from: () => ({ select: () => ({ limit }) }) } as unknown as SchoolReader;
  return { fake, limit };
}

describe("resolveSchoolId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("uses DEFAULT_SCHOOL_ID when it is set, without querying", async () => {
    const { fake, limit } = reader({ data: [], error: null });
    expect(await resolveSchoolId(fake, "configured-id")).toBe("configured-id");
    expect(limit).not.toHaveBeenCalled();
  });

  it("ignores a blank DEFAULT_SCHOOL_ID rather than provisioning into an empty id", async () => {
    // `DEFAULT_SCHOOL_ID=` with nothing after it is a plausible way to get
    // here, and is not a school.
    const { fake } = reader({ data: [{ id: "only-school" }], error: null });
    expect(await resolveSchoolId(fake, "   ")).toBe("only-school");
  });

  // The actual bug: unset variable, one school, nobody could sign in.
  it("falls back to the only school when DEFAULT_SCHOOL_ID is unset", async () => {
    const { fake } = reader({ data: [{ id: "only-school" }], error: null });
    expect(await resolveSchoolId(fake, undefined)).toBe("only-school");
  });

  it("refuses to guess between multiple schools", async () => {
    const { fake } = reader({ data: [{ id: "a" }, { id: "b" }], error: null });
    expect(await resolveSchoolId(fake, undefined)).toBeNull();
  });

  it("returns null when there are no schools at all", async () => {
    const { fake } = reader({ data: [], error: null });
    expect(await resolveSchoolId(fake, undefined)).toBeNull();
  });

  it("returns null when the lookup fails, rather than treating it as no schools", async () => {
    const { fake } = reader({ data: null, error: { message: "connection refused" } });
    expect(await resolveSchoolId(fake, undefined)).toBeNull();
  });
});
