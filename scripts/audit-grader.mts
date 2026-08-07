/**
 * Does the grader agree with a person?
 *
 *   npx tsx scripts/audit-grader.mts
 *
 * The per-topic strengths panel says which child is secure on what. That rests
 * on three things — the question, the answer, and the verdict — and only the
 * first has been checked. A right answer marked wrong feeds a false weakness,
 * and a teacher reteaches something the child already knew.
 *
 * 139 of the 219 approved questions are picked from options and cannot suffer
 * this. The other 80 are graded by matching free text or a number the student
 * typed, and that is where a correct answer gets rejected for its wording.
 *
 * Two passes:
 *
 *   REPLAY  every real attempt back through today's grader. Disagreement with
 *           the stored verdict means the grader changed under answers already
 *           counted, and somebody's analytics are stale.
 *
 *   PROBE   every approved fill and numeric question, answered CORRECTLY in
 *           the ways a fourteen-year-old actually writes: "a magnet" for
 *           "magnet", "8" when the mark scheme wants "8 Nm". Every rejection
 *           here is a mark a student would have lost to phrasing.
 *
 * The probe is the point. Two students have made 32 attempts; the exposure is
 * across all 80 questions, and waiting for a child to hit one is not a plan.
 *
 * Deterministic and free — no model calls — and it writes nothing.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env: Record<string, string> = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const { grade } = await import("../src/lib/grade");
type Question = Parameters<typeof grade>[0];

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const must = <T,>(r: { data: T | null; error: { message: string } | null }, w: string): T => {
  if (r.error) throw new Error(`${w}: ${r.error.message}`);
  if (r.data === null) throw new Error(`${w}: no data`);
  return r.data;
};

const questions = must(
  await db.from("generated_questions").select("id, prompt, question, status").eq("status", "approved"),
  "questions",
);
const attempts = must(
  await db.from("practice_attempts").select("id, question_id, answer, graded_result, created_at"),
  "attempts",
);
const byId = new Map(questions.map((q) => [q.id, q]));

// ----------------------------------------------------------------- REPLAY ---

console.log(`REPLAY — ${attempts.length} real attempts back through today's grader\n`);

let changed = 0;
let unmatched = 0;
for (const a of attempts) {
  const q = byId.get(a.question_id);
  if (!q) {
    unmatched++;
    continue;
  }
  const now = grade(q.question as Question, a.answer, q.prompt);
  const then = (a.graded_result as { correct?: boolean }).correct;
  if (then !== undefined && then !== now.correct) {
    changed++;
    console.log(`  VERDICT CHANGED  was ${then ? "right" : "wrong"} → now ${now.correct ? "right" : "wrong"}`);
    console.log(`    ${q.prompt.slice(0, 88)}`);
    console.log(`    student wrote: ${JSON.stringify(a.answer)}`);
  }
}
console.log(`  ${changed} verdicts changed since they were recorded`);
console.log(`  ${unmatched} attempts on questions no longer approved (correctly excluded from analytics)`);

// Every answer the grader rejected, for a person to read. A machine cannot
// tell "wrong" from "right, phrased differently" — that is the whole audit.
console.log(`\nEVERY REJECTED ANSWER, TO BE READ BY A PERSON\n`);
let rejected = 0;
for (const a of attempts) {
  const q = byId.get(a.question_id);
  if (!q) continue;
  const result = grade(q.question as Question, a.answer, q.prompt);
  if (result.correct) continue;
  rejected++;
  const kind = (q.question as { kind?: string }).kind;
  console.log(`  [${kind}] ${q.prompt.slice(0, 84)}`);
  console.log(`      wrote:  ${JSON.stringify(a.answer)}`);
  console.log(`      wanted: ${result.correctAnswer ?? "—"}`);
}
if (rejected === 0) console.log("  none");

// ------------------------------------------------------------------ PROBE ---

/**
 * Correct answers, written the way students write them.
 *
 * Every variant must be the SAME answer, only phrased differently. The first
 * run of this got that wrong — it offered "armatures" and "a armature" as
 * correct phrasings of "armature" and then counted the rejections as defects.
 * A plural is a different answer and "a armature" is not English, so being
 * marked wrong for either is the grader working. Only variants a real student
 * would write, and that a teacher would tick, belong here.
 */
function variants(q: Question, prompt: string): { label: string; answer: string }[] {
  if (q.kind === "fill") {
    const best = q.accept[0];
    if (!best) return [];
    const out = [
      { label: "exactly as the mark scheme has it", answer: best },
      { label: "capitalised, as at the start of a sentence", answer: best.charAt(0).toUpperCase() + best.slice(1) },
      { label: "with a full stop", answer: `${best}.` },
      { label: "with surrounding spaces", answer: `  ${best} ` },
    ];

    // An article is only a plausible answer if the sentence has not already
    // supplied one. "The gradient gives the ____ of the object" reads "gives
    // the the speed" if a student writes "the speed", so being marked wrong
    // for it is the grader working — and the second version of this probe
    // reported 113 of those as defects before anyone read the sentences.
    const before = prompt.slice(0, prompt.search(/_{2,}/)).trimEnd();
    if (!/\b(a|an|the)$/i.test(before)) {
      out.push({ label: "with an article", answer: `${/^[aeiou]/i.test(best) ? "an" : "a"} ${best}` });
      out.push({ label: "with 'the'", answer: `the ${best}` });
    }
    return out;
  }
  if (q.kind === "numeric") {
    const n = q.expected;
    const unit = q.unit ?? "";
    return [
      { label: "value and unit, the whole right answer", answer: `${n} ${unit}`.trim() },
      { label: "the bare number, no unit", answer: `${n}` },
      { label: "as a sentence", answer: `The answer is ${n} ${unit}`.trim() },
      { label: "with the unit written out", answer: `${n} ${unit}`.trim() },
    ];
  }
  return [];
}

console.log(`\n\nPROBE — the same right answer, phrased the way a student writes it\n`);

const losses = new Map<string, { prompt: string; kind: string; wanted: string; rejects: string[] }>();
let probed = 0;

for (const q of questions) {
  const question = q.question as Question;
  const vs = variants(question, q.prompt);
  if (vs.length === 0) continue;

  const rejects: string[] = [];
  for (const v of vs) {
    probed++;
    if (!grade(question, v.answer, q.prompt).correct) rejects.push(`${v.label} — ${JSON.stringify(v.answer)}`);
  }
  if (rejects.length > 0) {
    losses.set(q.id, {
      prompt: q.prompt,
      kind: question.kind,
      wanted: question.kind === "fill" ? question.accept.join(" / ") : String((question as { expected: number }).expected),
      rejects,
    });
  }
}

console.log(`${probed} correct answers tried across ${questions.filter((q) => variants(q.question as Question, q.prompt).length > 0).length} free-text questions`);
console.log(`${losses.size} questions reject at least one correct phrasing\n`);

// Grouped by what went wrong, so the finding is a rule rather than a list.
const byReason = new Map<string, number>();
for (const l of losses.values()) for (const r of l.rejects) byReason.set(r.split(" — ")[0], (byReason.get(r.split(" — ")[0]) ?? 0) + 1);
console.log("WHICH PHRASING LOSES THE MARK");
for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${reason}`);

console.log("\nEXAMPLES");
for (const l of [...losses.values()].slice(0, 10)) {
  console.log(`  [${l.kind}] ${l.prompt.slice(0, 84)}`);
  console.log(`      accepts: ${l.wanted}`);
  for (const r of l.rejects) console.log(`      rejects  ${r}`);
}
if (losses.size > 10) console.log(`  …and ${losses.size - 10} more`);

console.log("\nNothing was written.");
