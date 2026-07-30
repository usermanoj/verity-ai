import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Work scheduled after a response must go through after() from next/server.
//
// A floating promise — `void logTurn(...)` — appears to work everywhere it is
// tested. It works in development, where the process keeps running, and it
// works in production whenever another request happens to arrive and thaw the
// instance. It fails exactly when nobody is looking: the last reply of a
// student's session, where nothing arrives afterwards to flush the write.
//
// Measured in production before the fix: an assistant turn written 2m09s after
// its user turn, landing one second before the next request. Every sitting was
// losing its final exchange, and the transcript a teacher reads is built from
// those rows.
//
// No test can reproduce a frozen serverless instance, so this checks the shape
// instead. Cheap, and it fails the moment someone reintroduces the pattern.

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

describe("background writes in API routes", () => {
  it("never fires a promise with `void` instead of after()", () => {
    const offenders: string[] = [];
    for (const path of routeFiles(join("src", "app", "api"))) {
      const source = readFileSync(path, "utf8");
      source.split(/\r?\n/).forEach((line, i) => {
        const trimmed = line.trim();
        // Comments are skipped, so the note in tutor/route.ts explaining what
        // the old pattern was does not fail the rule describing it. (The first
        // run of this test caught exactly that, which is how I know the regex
        // matches the shape it is meant to.)
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        // `void 0` and type positions (`: void`, `=> void`) are not calls.
        if (/(^|[^:>])\bvoid\s+[a-zA-Z_$][a-zA-Z0-9_$.]*\s*\(/.test(line) && !/void\s+0/.test(line)) {
          offenders.push(`${path}:${i + 1} — ${trimmed}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("still schedules the tutor's assistant turn, rather than having dropped it", () => {
    // The counterpart to the rule above. Deleting the write entirely would
    // satisfy it, and would lose the transcript just as completely.
    const source = readFileSync(join("src", "app", "api", "tutor", "route.ts"), "utf8");
    expect(source).toMatch(/after\(/);
    expect(source).toMatch(/logTurn\(\s*conversationId,\s*"assistant"/);
  });
});
