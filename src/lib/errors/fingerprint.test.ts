import { describe, expect, it } from "vitest";
import { briefStack, fingerprintFor, sanitise, MAX_MESSAGE } from "./fingerprint";

// Two things are being asserted here, and one of them is a privacy rule.
//
// Grouping: if the same fault produces a different fingerprint each time, the
// error log becomes a list of near-duplicates nobody reads, which is the same
// outcome as having no error log.
//
// Redaction: this is a database about children, read by staff across a school.
// A Supabase error quotes row contents, so an unredacted message is how a
// child's email ends up in an operations table.

describe("sanitise — what must never be written down", () => {
  it("redacts an email address", () => {
    // Postgres errors quote the row. In this product that row is a person.
    expect(sanitise("duplicate key for user ana.lim@school.edu.sg")).toBe(
      "duplicate key for user <email>",
    );
  });

  it("redacts a uuid", () => {
    expect(sanitise("chunk 1661022a-79f3-47e7-88df-9eb23dbb9d75 not found")).toBe("chunk <id> not found");
  });

  it("redacts an api key and a jwt", () => {
    // A leaked key in a table staff can read is a security incident born of a
    // log line.
    expect(sanitise("auth failed for sk-abcdef1234567890xyz")).toBe("auth failed for <key>");
    expect(sanitise("bad token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-def")).toBe("bad token <jwt>");
  });

  it("collapses long digit runs so counts and timestamps do not split a fault", () => {
    expect(sanitise("timeout after 30000ms")).toBe("timeout after <n>ms");
  });

  it("leaves short numbers alone, because they are often the meaning", () => {
    // "429" and "500" are the useful part of an HTTP failure.
    expect(sanitise("provider returned 429")).toBe("provider returned 429");
  });

  it("collapses whitespace and truncates", () => {
    expect(sanitise("a\n\n  b")).toBe("a b");
    const long = sanitise("x".repeat(MAX_MESSAGE + 50));
    expect(long.length).toBe(MAX_MESSAGE);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("fingerprintFor — what counts as the same problem", () => {
  it("groups the same fault on different rows", () => {
    // The whole reason ids are stripped before hashing. Without this, one
    // failing query over a thousand rows is a thousand separate "problems".
    const a = fingerprintFor("ingest", "chunk 1661022a-79f3-47e7-88df-9eb23dbb9d75 not found");
    const b = fingerprintFor("ingest", "chunk b87ce9a7-36e7-48e5-b5b5-935d7e59337b not found");
    expect(a).toBe(b);
  });

  it("separates different faults", () => {
    expect(fingerprintFor("ingest", "chunk not found")).not.toBe(fingerprintFor("ingest", "upload failed"));
  });

  it("separates the same message in different areas", () => {
    // "request failed" in the tutor and in ingestion are different incidents
    // with different people to tell.
    expect(fingerprintFor("tutor", "request failed")).not.toBe(fingerprintFor("ingest", "request failed"));
  });

  it("is stable across calls", () => {
    expect(fingerprintFor("tutor", "boom")).toBe(fingerprintFor("tutor", "boom"));
  });
});

describe("briefStack", () => {
  it("keeps our frames and drops node internals", () => {
    const stack = [
      "Error: boom",
      "    at logTurn (/app/src/lib/conversations.ts:85:5)",
      "    at async POST (/app/src/app/api/tutor/route.ts:184:3)",
      "    at async node:internal/process/task_queues:95:5",
    ].join("\n");
    const brief = briefStack(stack);
    expect(brief).toContain("conversations.ts");
    expect(brief).not.toContain("node:internal");
  });

  it("redacts inside the stack too", () => {
    // Asserts the value is GONE rather than that a particular marker appears.
    // Here the home-directory rule swallows the whole segment, so the result is
    // "<home>/app.ts" rather than "<home>/<email>" — more redacted, not less,
    // and a test pinned to the marker would have called that a regression.
    const brief = briefStack("Error: x\n    at f (/Users/ana.lim@school.edu.sg/app.ts:1:1)")!;
    expect(brief).not.toContain("ana.lim");
    expect(brief).not.toContain("school.edu.sg");
  });

  it("redacts an email that is not part of a path", () => {
    const brief = briefStack("Error: x\n    at notify (/app/src/mail.ts:1:1) ana.lim@school.edu.sg")!;
    expect(brief).toContain("<email>");
  });

  it("returns null rather than an empty string when there is nothing useful", () => {
    // So a caller can distinguish "no stack" from "a stack of nothing".
    expect(briefStack(undefined)).toBeNull();
    expect(briefStack("Error: boom")).toBeNull();
    expect(briefStack("Error: x\n    at async node:internal/foo:1:1")).toBeNull();
  });

  it("bounds how much it keeps", () => {
    const stack = ["Error: x", ...Array.from({ length: 30 }, (_, i) => `    at f${i} (/app/a.ts:${i}:1)`)].join("\n");
    expect(briefStack(stack)!.split("\n")).toHaveLength(4);
  });
});

describe("briefStack — keeping the line that matters", () => {
  it("prefers our frames over library ones", () => {
    // Observed for real: a Supabase failure produced three Next frames before
    // the one naming our function, and a fixed four-frame window nearly pushed
    // it out. That line is the only one that says where to look.
    const stack = [
      "Error: boom",
      "    at throwForMissing (/app/node_modules/next/src/server/x.ts:1:1)",
      "    at cookies (/app/node_modules/next/src/request/cookies.ts:1:1)",
      "    at createClient (/app/node_modules/@supabase/ssr/dist/index.js:1:1)",
      "    at getRecordedErrors (/app/src/lib/errors/read.ts:27:28)",
    ].join("\n");
    const brief = briefStack(stack, 2)!;
    expect(brief).toContain("getRecordedErrors");
    expect(brief).not.toContain("node_modules");
  });

  it("falls back to library frames when there are no others", () => {
    // A stack of something beats a stack of nothing.
    const stack = "Error: x\n    at f (/app/node_modules/next/a.js:1:1)";
    expect(briefStack(stack)).toContain("node_modules");
  });

  it("redacts a developer's home directory", () => {
    // A local stack would otherwise put someone's name in a table the whole
    // school's staff can read.
    expect(briefStack("Error: x\n    at f (/Users/manoj/app/a.ts:1:1)")).toContain("<home>");
    expect(briefStack("Error: x\n    at f (C:\\Users\\Admin\\app\\a.ts:1:1)")).toContain("<home>");
  });
});
