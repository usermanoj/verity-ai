/**
 * How much is in the database, and how long does the read side take?
 *
 *   npx tsx scripts/audit-db-scale.mts
 *
 * Everything analytical here was built against two students and three decks. A
 * class of thirty is 15x the students and a term is far more than 40 attempts,
 * and nothing has ever been measured.
 *
 * WHAT THIS CAN AND CANNOT SHOW. PostgREST's plan output is disabled on this
 * project — `Accept: application/vnd.pgrst.plan` returns PGRST107 — and there
 * is no direct Postgres connection here, so there is no EXPLAIN. What can be
 * had is real: how many rows there are, and how long each read the dashboards
 * actually make takes against production today.
 *
 * That is a baseline, not a prediction. The prediction lives in the schema:
 * a table with no index on the column every query filters is fine at forty
 * rows and a sequential scan at forty thousand. Row counts say how far away
 * that is.
 *
 * IT CANNOT TELL YOU WHETHER AN INDEX EXISTS. Only `public` and
 * `graphql_public` are exposed over PostgREST, so pg_indexes and
 * information_schema are both out of reach.
 *
 * An earlier version printed an "index?" column anyway — a constant typed in
 * by hand, sitting in a table of measurements as though it had been looked up.
 * It still read NO after migration 0053 had created every one of them, and it
 * was offered as the way to verify that migration. A hand-written belief
 * formatted as a result is worse than no column at all. The SQL at the end of
 * the output is the real check.
 *
 * Read-only. Nothing is written.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env: Record<string, string> = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Every table a dashboard touches, and the columns its queries filter on.
//
// The filters come from reading each SQL function and each .eq()/.in() in the
// application. Whether an index covers them is deliberately NOT stated here —
// this script has no way to find out, and guessing in this column is the
// mistake described in the header.
const TABLES: { name: string; filters: string }[] = [
  { name: "events", filters: "user_id, type, created_at" },
  { name: "practice_attempts", filters: "student_id, created_at" },
  { name: "conversation_turns", filters: "conversation_id" },
  { name: "conversations", filters: "student_id, class_id" },
  { name: "generated_questions", filters: "chunk_id, status" },
  { name: "corpus_chunks", filters: "document_id" },
  { name: "corpus_document_sections", filters: "document_id, class_id" },
  { name: "corpus_documents", filters: "status, uploaded_by" },
  { name: "class_enrollments", filters: "class_id+student_id (PK)" },
  { name: "users", filters: "school_id, role" },
  { name: "classes", filters: "school_id, teacher_id" },
];

console.log("ROW COUNTS\n");
console.log("  rows  table                      queries filter on");
const counts = new Map<string, number>();
for (const t of TABLES) {
  const { count, error } = await db.from(t.name).select("*", { count: "exact", head: true });
  const n = error ? -1 : (count ?? 0);
  counts.set(t.name, n);
  console.log(`${String(n === -1 ? "?" : n).padStart(6)}  ${t.name.padEnd(25)}  ${t.filters}`);
}

// The read side, timed against production. Two students means these are all
// fast; the number worth keeping is the shape, so the same script run after a
// real class has used it says whether anything moved.
const students = (await db.from("users").select("id").eq("role", "student")).data ?? [];
const teachers = (await db.from("users").select("id").eq("role", "teacher")).data ?? [];
const student = students[0]?.id;
const teacher = teachers[0]?.id;

// The query builder is a thenable rather than a real Promise, so PromiseLike
// is what it satisfies.
async function time(label: string, run: () => PromiseLike<unknown>) {
  // Three runs, best of, so a single cold round trip does not become the
  // headline. Latency here is mostly network from this machine.
  let best = Infinity;
  let note = "";
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    const r = (await run()) as { error?: { message: string } | null };
    best = Math.min(best, performance.now() - t0);
    if (r?.error) note = ` (${r.error.message.slice(0, 60)})`;
  }
  console.log(`  ${String(Math.round(best)).padStart(5)} ms  ${label}${note}`);
}

console.log(`\nREAD LATENCY, best of 3, against production`);
console.log(`  ${students.length} students, ${teachers.length} teachers in the school\n`);

if (student && teacher) {
  await time("teacher_student_breakdown", () =>
    db.rpc("teacher_student_breakdown", { p_student_id: student }),
  );
  await time("teacher_student_detail", () => db.rpc("teacher_student_detail", { p_student_id: student }));
  await time("teacher_student_reading", () => db.rpc("teacher_student_reading", { p_student_id: student }));
  await time("teacher_student_timeline", () => db.rpc("teacher_student_timeline", { p_student_id: student }));
  await time("teacher_student_progress", () => db.rpc("teacher_student_progress", {}));
  await time("teacher_ingest_state", () => db.rpc("teacher_ingest_state", {}));
  await time("teacher_material_list", () => db.rpc("teacher_material_list", {}));
} else {
  console.log("  no student/teacher to probe with");
}

// The unindexed reads themselves, so the baseline is not only the RPCs.
await time("events by user", () =>
  db.from("events").select("id").eq("user_id", student ?? "").limit(100),
);
await time("events by type", () => db.from("events").select("id").eq("type", "lesson_open").limit(100));
await time("generated_questions by status", () =>
  db.from("generated_questions").select("id").eq("status", "approved"),
);

console.log(`
WHAT TO WATCH
  Everything above is within a few milliseconds of everything else, because at
  these row counts the query is free and the number is the round trip from this
  machine. Nothing here can be read as fast or slow.

  What matters is growth against the filters listed at the top. A sequential
  scan costs nothing over ninety rows and everything over ninety thousand —
  'events' first, because it gains a row every time any student opens a lesson
  or scrolls a section, and every dashboard reads it.
`);

const events = counts.get("events") ?? 0;
console.log(`  events today: ${events} rows. A class of 30 for one term, at a`);
console.log(`  conservative 20 events per lesson and 3 lessons a week for 12 weeks,`);
console.log(`  is about ${(30 * 20 * 3 * 12).toLocaleString()} rows — ${events > 0 ? Math.round((30 * 20 * 3 * 12) / events) : "many"}x what is there now.`);

console.log(`
TO CHECK THE INDEXES THEMSELVES
  This script cannot — pg_catalog is not exposed over PostgREST. Run this in
  the Supabase SQL editor. Migration 0053 adds nine named indexes; all nine
  should come back.

    select tablename, indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'events_user_type_created_idx',
        'generated_questions_chunk_status_idx',
        'conversation_turns_conversation_idx',
        'conversations_student_idx',
        'corpus_document_sections_document_idx',
        'corpus_document_sections_class_idx',
        'users_school_role_idx',
        'classes_school_idx',
        'classes_teacher_idx'
      )
    order by tablename, indexname;
`);

console.log("Nothing was written.");
