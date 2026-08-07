/**
 * Withdraw the questions that measure nothing.
 *
 *   npx tsx scripts/retire-hollow-questions.mts            show them, change nothing
 *   npx tsx scripts/retire-hollow-questions.mts --retire   actually withdraw them
 *   npx tsx scripts/retire-hollow-questions.mts --restore  put them back
 *
 * Retiring is what the teacher panel's Retire control does: status becomes
 * 'rejected'. The row keeps its text and its answers. Students stop being
 * served it, and attempts already made on it stop counting as evidence in the
 * strengths panel — which is the point, because a question anyone can answer
 * has been making every student look secure.
 *
 * Matched on the prompt rather than on an id so that this file says WHICH
 * questions and WHY, in a form a teacher can check. Ids belong to one database.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env: Record<string, string> = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * FIVE, not the seven I called them.
 *
 * Two of the questions the giveaway check flags are fair and are staying:
 *
 *   "When a magnetic material like iron or steel is placed near or touching a
 *    permanent magnet, it becomes a ____ itself."          accepts "magnet"
 *   "When an iron nail touches or is brought near a permanent magnet, it
 *    becomes a ____ itself."                               accepts "magnet"
 *
 * The word "magnet" is in each prompt as the thing doing the inducing, not the
 * thing the nail becomes. That is exactly the case the check was built to warn
 * about rather than act on, and acting on it here would throw away two decent
 * questions on the strength of a string match — after I had already written
 * down that no string match can tell them apart.
 */
const HOLLOW: { match: string; kind: string; why: string }[] = [
  {
    match: "Motion graphs can simplify the description of objects'",
    kind: "fill",
    why: "accepts 'motion'; the prompt opens with 'Motion graphs'",
  },
  {
    // The kind matters here. "Permanent magnets are made from" also matches a
    // TRUE/FALSE question — "Permanent magnets are made from permanent
    // magnetic materials because we do not want them to lose their magnetism"
    // — which restates the deck and asks the student to judge it. That is a
    // weak question, not a hollow one, and the first run of this script would
    // have withdrawn it as collateral from a loose string.
    match: "Permanent magnets are made from",
    kind: "fill",
    why: "accepts 'permanent' from 'Permanent magnets'; also marks 'hard' wrong, which the same deck teaches",
  },
  {
    match: "the domains point to north, and the head of the arrow shows",
    kind: "fill",
    why: "accepts 'north'; the prompt has already said the domains point north",
  },
  {
    match: "so a magnet always has",
    kind: "numeric",
    why: "accepts 2; the prompt says 'a north pole and south pole' immediately before the blank",
  },
  {
    match: "Each particle is about 20 millionths of an inch long",
    kind: "numeric",
    why: "asks for a length the prompt states in full",
  },
];

const retire = process.argv.includes("--retire");
const restore = process.argv.includes("--restore");

const all = (await db.from("generated_questions").select("id, prompt, question, status")).data ?? [];
const attempts = (await db.from("practice_attempts").select("question_id")).data ?? [];

const targets = HOLLOW.map((h) => ({
  ...h,
  rows: all.filter(
    (q) => q.prompt.includes(h.match) && (q.question as { kind?: string })?.kind === h.kind,
  ),
}));

console.log(`${restore ? "RESTORING" : retire ? "RETIRING" : "WOULD RETIRE"} ${targets.length} questions\n`);

let missing = 0;
for (const t of targets) {
  if (t.rows.length === 0) {
    missing++;
    console.log(`  !! no ${t.kind} question matches "${t.match}"`);
    continue;
  }
  for (const r of t.rows) {
    const hits = attempts.filter((a) => a.question_id === r.id).length;
    console.log(`  [${r.status}] ${r.prompt.slice(0, 92)}`);
    console.log(`      why: ${t.why}`);
    console.log(`      ${hits} student attempt${hits === 1 ? "" : "s"} recorded against it`);
    console.log(`      id:  ${r.id}`);
  }
}
if (missing > 0) console.log(`\n  ${missing} pattern(s) matched nothing — the bank may have changed.`);

const ids = targets.flatMap((t) => t.rows.map((r) => r.id));

if (retire || restore) {
  const status = restore ? "approved" : "rejected";
  const { error } = await db.from("generated_questions").update({ status }).in("id", ids);
  if (error) throw new Error(error.message);
  console.log(`\n${ids.length} question(s) set to '${status}'.`);
  console.log(`Reverse this with ${restore ? "--retire" : "--restore"}.`);
} else {
  console.log(`\nNothing was written. Add --retire to withdraw these ${ids.length}.`);
}
