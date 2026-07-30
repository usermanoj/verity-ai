/**
 * Deletes uploaded documents, by explicit selection, after showing what goes.
 *
 *   npx tsx scripts/remove-documents.mts --name="Pitch-Deck" --name="Townhall"
 *   npx tsx scripts/remove-documents.mts --id=cb64cd2c --write
 *
 * Nothing is selected by default and there is no "tidy up the junk" mode. What
 * counts as material a school should keep is a judgement about that school's
 * teaching, and it belongs to a person, not to a heuristic in a script — so the
 * caller has to name what they mean and read the list back before it happens.
 *
 * --name matches a case-insensitive substring of the file name; --id matches an
 * id prefix. Both may be repeated.
 *
 * REFUSES to delete a document with practice attempts or conversations against
 * it unless --force is given. Those are children's work. Deleting the document
 * nulls the links (ON DELETE SET NULL), which does not erase the rows but does
 * cost them their lesson, and that should never happen because someone was
 * clearing out old uploads. The refusal is the point of this script existing
 * rather than a hand-written delete.
 *
 * Cascades to chunks, generated questions, glossary terms, translations and
 * class assignments.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const FORCE = args.includes("--force");
const names = args.filter((a) => a.startsWith("--name=")).map((a) => a.slice(7).replace(/^["']|["']$/g, ""));
const ids = args.filter((a) => a.startsWith("--id=")).map((a) => a.slice(5));

if (names.length === 0 && ids.length === 0) {
  console.error("Nothing selected. Pass at least one --name=<substring> or --id=<prefix>.");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);

const { data: docs, error } = await db
  .from("corpus_documents")
  .select("id, source_file, status, created_at")
  .order("created_at");
if (error) throw error;

const selected = (docs ?? []).filter(
  (d) =>
    ids.some((i) => d.id.startsWith(i)) ||
    names.some((n) => d.source_file.toLowerCase().includes(n.toLowerCase())),
);

console.log(WRITE ? "MODE: WRITE\n" : "MODE: report only — pass --write to apply\n");
console.log(`MATCHED ${selected.length} of ${(docs ?? []).length} documents\n`);
if (selected.length === 0) process.exit(0);

const [{ data: chunks }, { data: qs }, { data: att }, { data: convos }, { data: gloss }, { data: tm }] =
  await Promise.all([
    db.from("corpus_chunks").select("id, document_id"),
    db.from("generated_questions").select("id, chunk_id"),
    db.from("practice_attempts").select("generated_question_id, document_id"),
    db.from("conversations").select("id, document_id"),
    db.from("corpus_glossary").select("id, document_id"),
    db.from("translation_memory").select("id, document_id"),
  ]);

const blocked: string[] = [];
const clear: typeof selected = [];

for (const d of selected) {
  const ch = (chunks ?? []).filter((c) => c.document_id === d.id);
  const chIds = new Set(ch.map((c) => c.id));
  const q = (qs ?? []).filter((x) => chIds.has(x.chunk_id!));
  const qIds = new Set(q.map((x) => x.id));
  const attempts = (att ?? []).filter(
    (x) => (x.generated_question_id && qIds.has(x.generated_question_id)) || x.document_id === d.id,
  ).length;
  const conversations = (convos ?? []).filter((x) => x.document_id === d.id).length;

  console.log(`${d.id.slice(0, 8)} ${d.status.padEnd(9)} ${d.source_file}`);
  console.log(
    `   cascades: ${ch.length} chunks, ${q.length} questions, ` +
      `${(gloss ?? []).filter((g) => g.document_id === d.id).length} glossary terms, ` +
      `${(tm ?? []).filter((t) => t.document_id === d.id).length} translations`,
  );

  if (attempts > 0 || conversations > 0) {
    console.log(`   STUDENT WORK: ${attempts} practice attempts, ${conversations} conversations`);
    if (FORCE) {
      console.log("   --force given, will delete anyway");
      clear.push(d);
    } else {
      console.log("   REFUSED — pass --force if you really mean it");
      blocked.push(d.source_file);
    }
  } else {
    console.log("   no student work against it");
    clear.push(d);
  }
  console.log();
}

if (blocked.length) {
  console.log(`SKIPPING ${blocked.length} document(s) with student work:`);
  for (const b of blocked) console.log(`   ${b}`);
  console.log();
}

if (!WRITE) {
  console.log(`Nothing written. ${clear.length} document(s) would be deleted.`);
  process.exit(0);
}

if (clear.length) {
  const { error: delErr } = await db
    .from("corpus_documents")
    .delete()
    .in("id", clear.map((d) => d.id));
  if (delErr) throw delErr;
  console.log(`Deleted ${clear.length} document(s).`);
}
