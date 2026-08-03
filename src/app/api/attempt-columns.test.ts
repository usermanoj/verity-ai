import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// A column nothing writes to.
//
// practice_attempts.document_id was added in migration 0028 and stayed null on
// every one of the first thirty-two answers this school recorded, because the
// route that inserts an attempt never set it. Nothing noticed for eighteen
// migrations — nothing read it. The moment something did (the per-topic
// breakdown, 0046), the feature returned an empty panel and looked broken.
//
// That failure has no runtime symptom to test for: the insert succeeds, the
// answer is stored, and only a much later read is poorer for it. So this checks
// the shape instead, which is cheap and fails the moment the column is dropped
// from the insert again.

const SOURCE = readFileSync("src/app/api/practice/attempt/route.ts", "utf8");

describe("the practice attempt insert", () => {
  // Each of these is read by something a teacher looks at. Losing any one of
  // them costs an analytic that cannot be reconstructed later, because the
  // question it referred to may be regenerated away.
  const REQUIRED = [
    "student_id",
    "question_id",
    "generated_question_id",
    "graded_result",
    "question_prompt",
    "question_level",
    "document_id",
  ];

  for (const column of REQUIRED) {
    it(`records ${column}`, () => {
      expect(SOURCE).toContain(`${column}:`);
    });
  }

  it("derives the topic on the server rather than trusting the request body", () => {
    // The browser knows which lesson it is on. A figure a teacher acts on
    // should not be something the page can assert about itself.
    const body = SOURCE.slice(SOURCE.indexOf("await req.json()"), SOURCE.indexOf("supabaseServer()"));
    expect(body).not.toContain("documentId");
  });
});
