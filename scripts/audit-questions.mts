/**
 * Every approved question, run past the checks that were meant to stop it.
 *
 *   npx tsx scripts/audit-questions.mts
 *   npx tsx scripts/audit-questions.mts --show-ok    # print the good ones too
 *
 * The per-topic strengths panel now rests on these questions. "Needs
 * reteaching on Magnets" is an accusation about a child, and it is only as
 * true as the questions behind it — a broken question makes a diligent student
 * look like they have not learned something.
 *
 * validateQuestion and isNarrativeRecall are the codebase's own definition of
 * a question that should never have been offered. They run at generation. What
 * nobody has done is run them over the bank that is already APPROVED, some of
 * which predates them.
 *
 * Deterministic and free: no model calls, and it writes nothing.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env: Record<string, string> = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const { validateQuestion } = await import("../src/lib/questions/validate");
const { isNarrativeRecall } = await import("../src/lib/questions/narrative");
// Imported, not reimplemented. The first version of this script had its own
// copy of the giveaway rule, which is the mistake this codebase keeps making:
// a rule written twice drifts, and the copy nobody reads is the one that rots.
const { visibleAnswer } = await import("../src/lib/questions/giveaway");
type Question = Parameters<typeof validateQuestion>[1];

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const showOk = process.argv.includes("--show-ok");

const must = <T,>(r: { data: T | null; error: { message: string } | null }, w: string): T => {
  if (r.error) throw new Error(`${w}: ${r.error.message}`);
  if (r.data === null) throw new Error(`${w}: no data`);
  return r.data;
};

const questions = must(
  await db.from("generated_questions").select("id, chunk_id, prompt, question, status, level").eq("status", "approved"),
  "questions",
);
const chunks = must(await db.from("corpus_chunks").select("id, document_id, heading, text"), "chunks");
const docs = must(await db.from("corpus_documents").select("id, source_file"), "documents");
const chunkById = new Map(chunks.map((c) => [c.id, c]));
const docById = new Map(docs.map((d) => [d.id, d]));

console.log(`${questions.length} APPROVED questions\n`);

const broken: string[] = [];
const narrative: string[] = [];
const giveaway: string[] = [];
const byKind = new Map<string, number>();
const seen = new Map<string, string[]>();

for (const q of questions) {
  const question = q.question as Question;
  const kind = (question as { kind?: string }).kind ?? "(none)";
  byKind.set(kind, (byKind.get(kind) ?? 0) + 1);

  const chunk = chunkById.get(q.chunk_id);
  const where = `${docById.get(chunk?.document_id ?? "")?.source_file ?? "?"} · ${chunk?.heading ?? "?"}`;

  const problems = validateQuestion(q.prompt, question);
  if (problems.length) broken.push(`  [${kind}] ${q.prompt.slice(0, 90)}\n      ${problems.join("; ")}\n      ${where}`);

  if (isNarrativeRecall(q.prompt, question)) narrative.push(`  [${kind}] ${q.prompt.slice(0, 100)}\n      ${where}`);

  const given = visibleAnswer(q.prompt, question);
  if (given) giveaway.push(`  ${q.prompt.slice(0, 90)}\n      answer "${given}" is in the question\n      ${where}`);

  // Keyed on the question, not on the prompt.
  //
  // The first run of this reported eleven "duplicates" and every one was a
  // false alarm: a matching question's prompt is an instruction — "Match each
  // term with its meaning" — shared by every grid in the deck while the terms
  // underneath are all different. Reporting those would have sent a teacher
  // hunting for a problem that is not there, which is worse than not looking.
  const key = JSON.stringify([
    q.prompt.trim().toLowerCase().replace(/\s+/g, " "),
    (question as { pairs?: { left: string }[] }).pairs?.map((p) => p.left.toLowerCase()) ?? null,
    (question as { options?: string[] }).options?.map((o) => o.toLowerCase()) ?? null,
  ]);
  seen.set(key, [...(seen.get(key) ?? []), where]);
}

console.log(`BY KIND: ${[...byKind].map(([k, n]) => `${k} ${n}`).join(", ")}`);

const report = (title: string, rows: string[], good: string) => {
  console.log(`\n${title}: ${rows.length}`);
  if (rows.length === 0) console.log(`  ${good}`);
  for (const r of rows.slice(0, 12)) console.log(r);
  if (rows.length > 12) console.log(`  …and ${rows.length - 12} more`);
};

report("FAIL THE CODEBASE'S OWN VALIDATOR", broken, "none — every approved question is well formed");
report("NARRATIVE RECALL (dates, discoverers)", narrative, "none");
report("ANSWER VISIBLE IN THE PROMPT", giveaway, "none");

const dupes = [...seen].filter(([, w]) => w.length > 1);
console.log(`\nDUPLICATE QUESTIONS: ${dupes.length}`);
if (dupes.length === 0) console.log("  none — no student is answering the same thing twice");
for (const [k, w] of dupes.slice(0, 8)) console.log(`  ×${w.length}  ${JSON.parse(k)[0].slice(0, 88)}`);

if (showOk) {
  console.log("\nA SAMPLE OF WHAT PASSED");
  for (const q of questions.slice(0, 5)) {
    console.log(`  [${(q.question as { kind?: string }).kind}] ${q.prompt}`);
    console.log(`      ${JSON.stringify(q.question).slice(0, 160)}`);
  }
}
console.log("\nNothing was written.");
