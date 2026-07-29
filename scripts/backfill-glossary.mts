/**
 * Generates the ESL glossary for documents ingested before migration 0021.
 *
 *   npx tsx scripts/backfill-glossary.mts                       # report only
 *   npx tsx scripts/backfill-glossary.mts --write               # generate and save
 *   npx tsx scripts/backfill-glossary.mts --only="Distance" --write
 *   npx tsx scripts/backfill-glossary.mts --include-demo --write
 *
 * Each document costs one model call, so the seeded "Demo — " fixtures are
 * skipped by default: they are synthetic material that no student reads, and
 * they outnumber the real uploads six to one.
 *
 * Per-document glossaries are produced at ingestion, so anything uploaded
 * before that existed has none — and a lesson with no underlined words looks
 * identical to a lesson with no hard words in it. That is the whole reason
 * this went unnoticed: the failure is silent.
 *
 * Safe to re-run. Documents that already have terms are skipped, never
 * regenerated, so a second run costs nothing and cannot produce duplicates
 * (the unique index on (document_id, lower(term)) would reject them anyway).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { generateGlossary } from "../src/lib/ingestion/glossary";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const write = process.argv.includes("--write");
const includeDemo = process.argv.includes("--include-demo");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key);

const { data: docs, error: docsError } = await db
  .from("corpus_documents")
  .select("id, source_file")
  .is("superseded_at", null)
  .order("created_at", { ascending: false });
if (docsError) throw docsError;

const { data: existing, error: existingError } = await db.from("corpus_glossary").select("document_id");
if (existingError) throw existingError;
const haveTerms = new Set((existing ?? []).map((r) => r.document_id as string));

const candidates = (docs ?? []).filter((d) => {
  if (haveTerms.has(d.id)) return false;
  if (!includeDemo && d.source_file.startsWith("Demo ")) return false;
  if (only && !d.source_file.toLowerCase().includes(only.toLowerCase())) return false;
  return true;
});
const missing = candidates;
const demoSkipped = (docs ?? []).filter((d) => !haveTerms.has(d.id) && d.source_file.startsWith("Demo ")).length;
console.log(
  `${docs?.length ?? 0} live documents · ${haveTerms.size} with a glossary · ${missing.length} to generate` +
    (includeDemo || demoSkipped === 0 ? "" : ` (${demoSkipped} demo fixtures skipped — --include-demo to add them)`) +
    "\n",
);

if (missing.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}
for (const d of missing) console.log(`  ${d.id.slice(0, 8)}  ${d.source_file}`);

if (!write) {
  console.log("\nDry run. Re-run with --write to generate these.");
  process.exit(0);
}

console.log("");
let done = 0;
let skipped = 0;
for (const doc of missing) {
  // Sequential on purpose. Backfill is a one-off over a handful of documents,
  // and the free-tier rate limits that forced a concurrency cap on ingestion
  // apply here too — there is nothing to gain by racing them.
  const { data: chunks, error } = await db
    .from("corpus_chunks")
    .select("heading, text")
    .eq("document_id", doc.id)
    .order("created_at", { ascending: true });
  if (error) {
    console.error(`  ✗ ${doc.source_file}: could not read chunks —`, error.message);
    continue;
  }
  const text = (chunks ?? []).map((c) => [c.heading, c.text].filter(Boolean).join(": ")).join("\n\n");

  const terms = await generateGlossary(doc.source_file, text);
  if (terms.length === 0) {
    // generateGlossary logs its own reason; a document that is genuinely too
    // short to have vocabulary is a legitimate empty result, not a failure.
    console.log(`  – ${doc.source_file}: no terms`);
    skipped += 1;
    continue;
  }

  const { error: insertError } = await db
    .from("corpus_glossary")
    .insert(terms.map((t) => ({ document_id: doc.id, term: t.term, en: t.en, zh: t.zh })));
  if (insertError) {
    console.error(`  ✗ ${doc.source_file}:`, insertError.message);
    continue;
  }
  console.log(`  ✓ ${doc.source_file}: ${terms.length} terms`);
  done += 1;
}

console.log(`\n${done} document(s) given a glossary, ${skipped} with nothing to extract.`);
