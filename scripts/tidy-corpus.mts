/**
 * Two clean-ups on the real corpus, both reported before anything is written.
 *
 *   npx tsx scripts/tidy-corpus.mts            # report only, changes nothing
 *   npx tsx scripts/tidy-corpus.mts --write    # apply
 *
 * 1. RETIRE NARRATIVE QUESTIONS. Approved questions that test who discovered
 *    something and when — see src/lib/questions/narrative.ts for why they are
 *    worse than useless for an ESL student. Set to 'rejected', never deleted:
 *    practice_attempts.generated_question_id is ON DELETE SET NULL, so
 *    deleting a question would sever a child's answer from the concept it was
 *    about, and their answer is evidence about them even when the question was
 *    a bad one. getPracticeBank reads only 'approved', so retiring is enough
 *    to stop students seeing them, and it is reversible.
 *
 * 2. PURGE SUPERSEDED DOCUMENTS. Re-uploading a deck marks the old copy
 *    superseded_at rather than removing it, and every read already filters on
 *    that — students and the class list have never seen these. What they do
 *    still occupy is the teacher's uploads screen and 80 rows of chunks and
 *    questions. Any practice attempt pointing into a copy being deleted has
 *    its question text snapshotted FIRST, so the row stays readable after the
 *    FK is nulled.
 *
 * Deliberately not touched: approved decks that are not curriculum at all
 * (business pitch decks sitting in the corpus). They are a judgement about
 * what belongs in a school's material, not a duplicate, and deleting a
 * teacher's upload on a guess is not this script's business.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const WRITE = process.argv.includes("--write");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

// Dynamic, so the env above is in place before anything reads it at module
// scope — the ordering that broke the glossary backfill (ESM hoists static
// imports above everything else in the file).
const { isNarrativeRecall } = await import("../src/lib/questions/narrative");

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

console.log(WRITE ? "MODE: WRITE\n" : "MODE: report only — pass --write to apply\n");

// ---------------------------------------------------------------- 1. questions
const { data: questions, error: qErr } = await db
  .from("generated_questions")
  .select("id, prompt, status, question, chunk_id, corpus_chunks(heading, document_id)")
  .eq("status", "approved");
if (qErr) throw qErr;

const narrative = (questions ?? []).filter((q) => isNarrativeRecall(q.prompt, q.question as never));

console.log(`APPROVED QUESTIONS: ${(questions ?? []).length}`);
console.log(`TO RETIRE (narrative): ${narrative.length}`);
for (const q of narrative) {
  const heading = (q.corpus_chunks as unknown as { heading: string | null } | null)?.heading ?? "?";
  console.log(`   (${heading}) ${q.prompt}`);
}

if (WRITE && narrative.length > 0) {
  const { error } = await db
    .from("generated_questions")
    .update({ status: "rejected" })
    .in("id", narrative.map((q) => q.id));
  if (error) throw error;
  console.log(`   → retired ${narrative.length}`);
}

// ---------------------------------------------------------------- 2. documents
const { data: docs, error: dErr } = await db
  .from("corpus_documents")
  .select("id, source_file, status, created_at, superseded_at")
  .not("superseded_at", "is", null);
if (dErr) throw dErr;

const doomed = (docs ?? []).map((d) => d.id);
console.log(`\nSUPERSEDED DOCUMENTS TO PURGE: ${doomed.length}`);

const { data: chunks } = await db.from("corpus_chunks").select("id, document_id").in("document_id", doomed.length ? doomed : ["-"]);
const chunkIds = (chunks ?? []).map((c) => c.id);
const { data: theirQuestions } = await db
  .from("generated_questions")
  .select("id, prompt, level, chunk_id")
  .in("chunk_id", chunkIds.length ? chunkIds : ["-"]);

for (const d of docs ?? []) {
  const ch = (chunks ?? []).filter((c) => c.document_id === d.id);
  const chIds = new Set(ch.map((c) => c.id));
  const qs = (theirQuestions ?? []).filter((q) => chIds.has(q.chunk_id!));
  console.log(`   ${d.id.slice(0, 8)} ${d.status.padEnd(9)} ${d.created_at.slice(0, 10)}  ${d.source_file}`);
  console.log(`      ${ch.length} chunks, ${qs.length} questions — cascade`);
}

// Snapshot before the cascade nulls the link. A child's answer must not become
// unreadable because a teacher tidied their uploads (the reasoning in 0028).
const doomedQuestionIds = new Set((theirQuestions ?? []).map((q) => q.id));
const { data: attempts } = await db
  .from("practice_attempts")
  .select("id, generated_question_id, question_prompt, question_level");
const stranded = (attempts ?? []).filter(
  (a) => a.generated_question_id && doomedQuestionIds.has(a.generated_question_id),
);
const needSnapshot = stranded.filter((a) => !a.question_prompt);

console.log(`\nPRACTICE ATTEMPTS POINTING INTO THOSE COPIES: ${stranded.length}`);
console.log(`   already snapshotted, will stay readable: ${stranded.length - needSnapshot.length}`);
console.log(`   need a snapshot first: ${needSnapshot.length}`);

if (WRITE) {
  for (const a of needSnapshot) {
    const q = (theirQuestions ?? []).find((x) => x.id === a.generated_question_id);
    if (!q) continue;
    const { error } = await db
      .from("practice_attempts")
      .update({ question_prompt: q.prompt, question_level: q.level })
      .eq("id", a.id);
    if (error) throw error;
  }
  if (needSnapshot.length) console.log(`   → snapshotted ${needSnapshot.length}`);

  if (doomed.length) {
    const { error } = await db.from("corpus_documents").delete().in("id", doomed);
    if (error) throw error;
    console.log(`   → purged ${doomed.length} documents`);
  }
}

console.log(WRITE ? "\nDone." : "\nNothing written.");
