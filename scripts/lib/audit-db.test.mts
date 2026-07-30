import { describe, expect, it } from "vitest";
import { must, optional, parseEnv, table } from "./audit-db.mts";

// The audit tooling gets tests because the tooling is what finds the bugs, and
// it has been wrong three times in one project — each time by reading a failed
// query as an empty result. A wrong audit is worse than no audit: it produces a
// confident answer nobody re-checks.

describe("must", () => {
  it("returns the data when the query worked", () => {
    expect(must({ data: [1, 2], error: null }, "select")).toEqual([1, 2]);
  });

  it("keeps an empty result, which is a real answer", () => {
    expect(must({ data: [], error: null }, "select")).toEqual([]);
  });

  it("throws on an error instead of returning nothing", () => {
    // The exact failure this exists for: `const { data } = await ...` then
    // reading data.length as zero.
    expect(() => must({ data: null, error: { message: "column x does not exist" } }, "select conversations")).toThrow(
      /select conversations failed: column x does not exist/,
    );
  });

  it("includes the error code when there is one", () => {
    expect(() => must({ data: null, error: { message: "duplicate", code: "23505" } }, "insert")).toThrow(/\[23505\]/);
  });

  it("throws on a null payload with no error, which means the shape is wrong", () => {
    // A list select returns [] when it finds nothing. null without an error is
    // structural — a table or column that is not there — and is precisely the
    // case that otherwise reads as "no rows".
    expect(() => must({ data: null, error: null }, "select users")).toThrow(/does that table or column exist/);
  });

  it("names the query, because an audit runs a dozen of them", () => {
    expect(() => must({ data: null, error: { message: "boom" } }, "teacher_class_codes")).toThrow(/teacher_class_codes/);
  });
});

describe("optional", () => {
  it("allows an absent row", () => {
    // maybeSingle() finding nothing is information, not a fault.
    expect(optional({ data: null, error: null }, "maybeSingle")).toBeNull();
  });

  it("still refuses an error", () => {
    expect(() => optional({ data: null, error: { message: "nope" } }, "lookup")).toThrow(/lookup failed: nope/);
  });
});

describe("parseEnv", () => {
  it("reads plain assignments", () => {
    expect(parseEnv("A=1\nB=two")).toEqual({ A: "1", B: "two" });
  });

  it("strips surrounding quotes", () => {
    // A value that keeps its quotes still looks like a value, and the audit
    // then runs against nothing while reporting an empty database.
    expect(parseEnv('URL="https://x.example"')).toEqual({ URL: "https://x.example" });
    expect(parseEnv("K='v'")).toEqual({ K: "v" });
  });

  it("keeps everything after the first equals", () => {
    // JWTs and connection strings contain '='. Splitting on every one of them
    // truncates the key and the failure is a 401 with no explanation.
    expect(parseEnv("JWT=aaa.bbb=cc==")).toEqual({ JWT: "aaa.bbb=cc==" });
  });

  it("ignores comments, blanks and malformed lines", () => {
    expect(parseEnv("# note\n\n  \nNOEQUALS\n=novalue\nA=1")).toEqual({ A: "1" });
  });

  it("handles CRLF, since this is written on Windows", () => {
    expect(parseEnv("A=1\r\nB=2\r\n")).toEqual({ A: "1", B: "2" });
  });

  it("trims whitespace around both sides", () => {
    expect(parseEnv("  A = 1  ")).toEqual({ A: "1" });
  });
});

describe("table", () => {
  it("aligns columns", () => {
    const out = table([
      ["SECTION", "STUDENTS"],
      ["7A", "0"],
      ["ALL 3", "12"],
    ]);
    expect(out.split("\n")[1]).toBe("7A       0");
  });

  it("survives an empty set and ragged rows", () => {
    expect(table([])).toBe("");
    expect(() => table([["a", "b"], ["c"]])).not.toThrow();
  });
});
