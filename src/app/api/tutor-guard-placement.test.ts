import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Where the citation check runs is the whole of its cost.
//
// Inside after() it happens once the student already has their answer, and the
// scan finds nothing on the ~95% of replies that obey rule 3, so the common
// case is one pass over a string already in memory. Moved above the stream —
// which is the natural place someone would put it while "tidying" — it becomes
// a corpus read between a child pressing Explain and seeing a word.
//
// No test can measure that from here. This checks the shape instead, which is
// cheap and fails the moment the check moves.

const SOURCE = readFileSync("src/app/api/tutor/route.ts", "utf8");

describe("the tutor's citation check", () => {
  it("runs inside after(), never before the stream", () => {
    const afterAt = SOURCE.indexOf("after(async () => {");
    const scanAt = SOURCE.indexOf("namedSections(text)");
    expect(afterAt).toBeGreaterThan(-1);
    expect(scanAt).toBeGreaterThan(afterAt);
  });

  it("reads the corpus only when a section was actually named", () => {
    // The read is the expensive half. It must sit behind the scan, so a reply
    // that named nothing costs one regex and no I/O.
    const scanAt = SOURCE.indexOf("namedSections(text)");
    const guardAt = SOURCE.indexOf("if (named.length > 0)");
    const readAt = SOURCE.indexOf("await corpusForTopic(topic)");
    expect(guardAt).toBeGreaterThan(scanAt);
    expect(readAt).toBeGreaterThan(guardAt);
  });

  it("never lets the check cost a student their transcript", () => {
    // The turn is the row a teacher reads. A failing guard must not take it
    // down with it.
    const guardBlock = SOURCE.slice(
      SOURCE.indexOf("if (named.length > 0)"),
      SOURCE.indexOf('await logTurn(conversationId, "assistant"'),
    );
    expect(guardBlock).toContain("catch");
  });

  it("still writes the turn whatever the check found", () => {
    const afterBlock = SOURCE.slice(SOURCE.indexOf("after(async () => {"));
    expect(afterBlock).toContain('await logTurn(conversationId, "assistant", text, intent, cited)');
  });
});
