import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The migration files must describe the database that exists.
//
// 0035 widened nine role gates by rewriting function bodies in place — reading
// each definition out of pg_proc, substituting the predicate, and re-executing
// it. Nothing wrote the result back to disk, so six files went on describing a
// database that had stopped existing. Replaying them into a fresh environment
// restores the narrow gate, and the symptom is the one 0035 itself warned
// about: the page opens and every panel on it is empty, because an empty
// result is not an error.
//
// It came within one line of shipping twice in a single day. Two later
// migrations had to re-declare functions whose newest file still carried the
// old predicate, and both were caught only because the drift was already known
// about.
//
// No database access here, and none needed. The question is entirely about
// what the files say.

const DIR = "supabase/migrations";

/** The old, too-narrow gate. `<> 'teacher'` is a different rule and is left alone. */
const OLD_GATE = "role = 'teacher'";

type Definition = { migration: string; fn: string; body: string };

/**
 * Every function definition across the migrations, in file order.
 *
 * Bodies only: a comment discussing the old predicate — this file, and the
 * migrations that explain the drift — is documentation, not a gate.
 */
function definitions(): Definition[] {
  const out: Definition[] = [];
  for (const name of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(DIR, name), "utf8").replace(/\r\n/g, "\n");
    const re = /create or replace function\s+(public\.\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const end = sql.indexOf("$$;", m.index);
      out.push({
        migration: name,
        fn: m[1],
        body: sql.slice(m.index, end > 0 ? end : undefined),
      });
    }
  }
  return out;
}

/** The last file to define each function is the one that describes reality. */
function newest(): Map<string, Definition> {
  const latest = new Map<string, Definition>();
  for (const d of definitions()) latest.set(d.fn, d);
  return latest;
}

describe("migration files describe the live database", () => {
  it("finds functions to check at all", () => {
    // A regex that silently matched nothing would make every assertion below
    // pass while checking nothing — the failure this whole file is about.
    expect(newest().size).toBeGreaterThan(20);
  });

  it("has no function whose newest definition still restricts to a teacher", () => {
    const stale = [...newest().values()]
      .filter((d) => d.body.includes(OLD_GATE))
      .map((d) => `${d.fn} (last defined in ${d.migration})`);

    // If this fails, replaying the migrations into a fresh database produces
    // narrower access than production has, and every panel behind that
    // function comes back empty rather than erroring.
    expect(stale).toEqual([]);
  });

  it("keeps the hod withdrawal rule, which is a different predicate", () => {
    // 0034: a head of department may withdraw a teacher and not a colleague.
    // 0035 deliberately did not touch `<> 'teacher'`, and neither does this.
    const all = definitions().map((d) => d.body).join("\n");
    expect(all).toContain("<> 'teacher'");
  });
});
