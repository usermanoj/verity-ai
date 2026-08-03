/**
 * Who can read a section's chosen illustration, and who can set one.
 *
 *   npx tsx scripts/check-visual-access.mts
 *
 * THIS SCRIPT WRITES. section_visuals is empty until a teacher overrides
 * something, so there is nothing to measure access to until a row exists. It
 * sets one visual on a section of the setter's OWN document, reads it as every
 * account in the school, and then hands the section back to automatic matching
 * in a `finally` — so the revert runs even if a read throws, which is how the
 * first version of this check left a row behind.
 *
 * It measures behaviour, not schema. A function that exists and refuses
 * everyone looks identical to one that works, right up until a teacher tries to
 * use it, and the difference between "no rows" and "the policy could not be
 * evaluated" is invisible from the application — which reads this table with
 * the service role and would look correct either way.
 *
 * Costs one sign-in record per account.
 */
import { adminClient, asUser, loadEnv, must, table } from "./lib/audit-db.mts";

const env = loadEnv();
const db = adminClient(env);

const docs = must(
  await db.from("corpus_documents").select("id, source_file, uploaded_by").eq("status", "approved"),
  "approved documents",
);
const owned = docs.filter((d) => d.uploaded_by);
if (owned.length === 0) throw new Error("No approved document has an uploader — nothing to set a visual on.");

const auth = await db.auth.admin.listUsers();
if (auth.error) throw new Error(`listUsers failed: ${auth.error.message}`);
const emailFor = (id: string) => auth.data.users.find((u) => u.id === id)?.email ?? "";

const people = must(await db.from("users").select("id, role, display_name").order("role"), "users");
const classes = must(await db.from("classes").select("id, section_name"), "classes");
const enrolments = must(await db.from("class_enrollments").select("student_id, class_id"), "enrolments");
const links = must(await db.from("corpus_document_sections").select("document_id, class_id"), "document sections");

// The deck whose uploader is NOT the most senior person available, where
// there is a choice: the asymmetry worth testing is a colleague reading
// someone else's lesson, and picking the principal's own deck would hide it.
const subject = owned.find((d) => people.find((p) => p.id === d.uploaded_by)?.role === "teacher") ?? owned[0];
const setterEmail = emailFor(subject.uploaded_by!);
if (!setterEmail) throw new Error("The uploader has no auth account to act as.");

const chunk = must(
  await db.from("corpus_chunks").select("id, heading").eq("document_id", subject.id).limit(1),
  "chunks",
)[0];
if (!chunk) throw new Error(`${subject.source_file} has no chunks.`);

const reachedBy = new Set(
  enrolments
    .filter((e) => links.some((l) => l.document_id === subject.id && l.class_id === e.class_id))
    .map((e) => e.student_id),
);

const setter = await asUser(setterEmail, env);
const call = async (visual: string | null, explicit: boolean) => {
  const r = await setter.rpc("teacher_set_section_visual", {
    p_chunk_id: chunk.id,
    p_visual: visual,
    p_explicit: explicit,
  });
  if (r.error) throw new Error(`teacher_set_section_visual failed: ${r.error.message}`);
  return r.data as { ok?: boolean; state?: string; error?: string };
};

console.log(`\nsubject: "${chunk.heading}" in ${subject.source_file}, uploaded by ${setterEmail}`);

try {
  const set = await call("lever", true);
  if (!set.ok) throw new Error(`could not set a visual as the uploader: ${set.error}`);
  console.log(`set: ${set.state}`);

  const rows: string[][] = [["WHO", "ROLE", "RELATION TO THIS DECK", "ROWS", ""]];
  for (const p of people) {
    const email = emailFor(p.id);
    if (!email) {
      rows.push([p.display_name ?? "?", String(p.role), "no auth account", "—", ""]);
      continue;
    }
    // Why this person should or should not see it, worked out from the
    // enrolment tables rather than assumed, so the expectation is derived from
    // the same data the policy reads.
    const isUploader = p.id === subject.uploaded_by;
    const isStaff = p.role !== "student";
    const relation = isUploader
      ? "the uploader"
      : isStaff
        ? "staff, not the uploader"
        : reachedBy.has(p.id)
          ? "a student it reaches"
          : "a student it does not reach";
    const expected = isUploader || isStaff || reachedBy.has(p.id) ? 1 : 0;

    const me = await asUser(email, env);
    const r = await me.from("section_visuals").select("chunk_id, visual").eq("chunk_id", chunk.id);
    await me.auth.signOut();

    if (r.error) {
      rows.push([p.display_name ?? "?", String(p.role), relation, "ERR", r.error.message.slice(0, 40)]);
      continue;
    }
    const n = r.data?.length ?? 0;
    rows.push([
      p.display_name ?? "?",
      String(p.role),
      relation,
      String(n),
      n === expected ? "as intended" : `WRONG — expected ${expected}`,
    ]);
  }
  console.log("\n" + table(rows));
} finally {
  const back = await call(null, false);
  const left = must(await db.from("section_visuals").select("chunk_id"), "section_visuals");
  console.log(`\nreverted: ${back.state} — section_visuals holds ${left.length} row(s)`);
  await setter.auth.signOut();
}
