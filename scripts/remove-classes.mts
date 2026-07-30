/**
 * Removes class sections, by explicit selection, after showing what goes.
 *
 *   npx tsx scripts/remove-classes.mts --name=7A --name=TEST
 *   npx tsx scripts/remove-classes.mts --name="ALL 3" --write
 *
 * REFUSES any section with students, material or conversations against it, and
 * there is no --force. That is not caution for its own sake: conversations.
 * class_id is ON DELETE CASCADE, so removing a class DELETES the transcripts of
 * every lesson taught in it. A child's record of what they asked is not
 * something a tidy-up should be able to destroy, and a flag that permits it is
 * a flag someone will eventually pass.
 *
 * What it is for is the sections that accumulate while a school is being set
 * up — a "TEST" from the first afternoon, an "ALL 5" that was a guess at how
 * courses worked. Those crowd the class list, and a list where half the rows
 * are empty makes the two that matter harder to find.
 *
 * Empty join codes are removed with the class. A code that admits students to
 * a section that no longer exists is worse than no code.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const names = args.filter((a) => a.startsWith("--name=")).map((a) => a.slice(7).replace(/^["']|["']$/g, ""));

if (names.length === 0) {
  console.error('Nothing selected. Pass at least one --name=<section>, e.g. --name=7A --name="ALL 3".');
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

const [{ data: classes }, { data: enrolments }, { data: sections }, { data: conversations }, { data: codes }] =
  await Promise.all([
    db.from("classes").select("id, section_name"),
    db.from("class_enrollments").select("class_id"),
    db.from("corpus_document_sections").select("class_id"),
    db.from("conversations").select("class_id"),
    db.from("class_join_codes").select("class_id"),
  ]);

const wanted = names.map((n) => n.toLowerCase());
const selected = (classes ?? []).filter((c) => wanted.includes(c.section_name.toLowerCase()));

console.log(WRITE ? "MODE: WRITE\n" : "MODE: report only — pass --write to apply\n");

const missing = names.filter((n) => !(classes ?? []).some((c) => c.section_name.toLowerCase() === n.toLowerCase()));
// Named but not found is reported, not ignored. A typo that silently matches
// nothing looks exactly like a section that was already removed.
for (const m of missing) console.log(`  no section called "${m}"`);

const removable: typeof selected = [];
for (const c of selected) {
  const students = (enrolments ?? []).filter((e) => e.class_id === c.id).length;
  const material = (sections ?? []).filter((s) => s.class_id === c.id).length;
  const talked = (conversations ?? []).filter((v) => v.class_id === c.id).length;
  const joinCodes = (codes ?? []).filter((k) => k.class_id === c.id).length;

  console.log(`${c.section_name}`);
  console.log(`   ${students} students, ${material} document(s), ${talked} conversation(s), ${joinCodes} join code(s)`);

  if (students || material || talked) {
    console.log(`   REFUSED — a section in use is not a section to tidy away`);
    if (talked) console.log(`   deleting it would cascade to ${talked} transcript(s)`);
  } else {
    console.log(`   safe: nothing references it`);
    removable.push(c);
  }
  console.log();
}

if (!WRITE) {
  console.log(`Nothing written. ${removable.length} section(s) would be removed.`);
  process.exit(0);
}

if (removable.length) {
  const { error } = await db.from("classes").delete().in("id", removable.map((c) => c.id));
  if (error) throw error;
  console.log(`Removed ${removable.length} section(s).`);
}
