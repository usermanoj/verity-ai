/**
 * What the database actually contains, and what a page would actually show.
 *
 *   npx tsx scripts/audit.mts                       # everything
 *   npx tsx scripts/audit.mts corpus classes
 *   npx tsx scripts/audit.mts pages --as=head@school.edu
 *
 * Sections: corpus · classes · students · pages · visuals · health
 *
 * This replaces the throwaway probes that were retyped for every check. They
 * were wrong three times, always the same way — a failed query destructured as
 * `{ data }` and read as an empty result — so every read here goes through
 * must(), which throws with the query's name rather than reporting nothing.
 *
 * `pages` is the section that cannot be faked. Every teacher-facing function is
 * gated on auth.uid(), so the service-role key gets `[]` from all of them
 * whether they work or not. --as signs in as a real member of staff and asks
 * the questions their screen asks, which is the only way to tell a working
 * function from a broken one. It costs a sign-in record on that account.
 */
import { adminClient, asUser, loadEnv, must, table } from "./lib/audit-db.mts";

const args = process.argv.slice(2);
const asEmail = args.find((a) => a.startsWith("--as="))?.slice(5);
const requested = args.filter((a) => !a.startsWith("--"));
const ALL = ["corpus", "classes", "students", "pages", "visuals", "health"] as const;
const sections = requested.length ? requested : [...ALL];

const unknown = sections.filter((s) => !(ALL as readonly string[]).includes(s));
if (unknown.length) {
  console.error(`Unknown section(s): ${unknown.join(", ")}. Choose from: ${ALL.join(", ")}`);
  process.exit(1);
}

const env = loadEnv();
const db = adminClient(env);
const heading = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m\n${"─".repeat(s.length)}`);

// ─────────────────────────────────────────────────────────────────── corpus
async function corpus() {
  heading("CORPUS");
  const docs = must(await db.from("corpus_documents").select("id, source_file, status, superseded_at"), "corpus_documents");
  const chunks = must(await db.from("corpus_chunks").select("id, document_id"), "corpus_chunks");
  const questions = must(await db.from("generated_questions").select("id, chunk_id, status"), "generated_questions");
  const glossary = must(await db.from("corpus_glossary").select("id, document_id"), "corpus_glossary");

  const rows = [["STATUS", "DOCUMENT", "CHUNKS", "APPROVED Q", "GLOSSARY"]];
  for (const d of docs) {
    const mine = chunks.filter((c) => c.document_id === d.id);
    const ids = new Set(mine.map((c) => c.id));
    rows.push([
      d.superseded_at ? "superseded" : d.status,
      d.source_file.replace(/\.[^.]+$/, ""),
      String(mine.length),
      String(questions.filter((q) => ids.has(q.chunk_id!) && q.status === "approved").length),
      String(glossary.filter((g) => g.document_id === d.id).length),
    ]);
  }
  console.log(table(rows));

  // Orphans are the class of fault that survives every UI check, because a row
  // pointing at nothing renders as nothing.
  const docIds = new Set(docs.map((d) => d.id));
  const chunkIds = new Set(chunks.map((c) => c.id));
  const sections_ = must(await db.from("corpus_document_sections").select("document_id, class_id"), "corpus_document_sections");
  const orphans: [string, number][] = [
    ["chunks → missing document", chunks.filter((c) => !docIds.has(c.document_id)).length],
    ["questions → missing chunk", questions.filter((q) => !chunkIds.has(q.chunk_id!)).length],
    ["glossary → missing document", glossary.filter((g) => !docIds.has(g.document_id!)).length],
    ["section links → missing document", sections_.filter((s) => !docIds.has(s.document_id)).length],
  ];
  console.log("\n" + table([["ORPHAN CHECK", ""], ...orphans.map(([k, v]) => [k, String(v)])]));
}

// ────────────────────────────────────────────────────────────────── classes
async function classes() {
  heading("CLASSES");
  const cls = must(await db.from("classes").select("id, section_name, course_id"), "classes");
  const enrol = must(await db.from("class_enrollments").select("class_id"), "class_enrollments");
  const links = must(await db.from("corpus_document_sections").select("class_id, document_id"), "corpus_document_sections");
  const docs = must(await db.from("corpus_documents").select("id, source_file, status, superseded_at"), "corpus_documents");
  const convs = must(await db.from("conversations").select("id, class_id"), "conversations");

  const rows = [["SECTION", "STUDENTS", "MATERIAL", "CONVERSATIONS"]];
  let stranded = 0;
  for (const c of cls) {
    const students = enrol.filter((e) => e.class_id === c.id).length;
    const material = links
      .filter((l) => l.class_id === c.id)
      .map((l) => docs.find((d) => d.id === l.document_id))
      .filter((d) => d && d.status === "approved" && !d.superseded_at)
      .map((d) => d!.source_file.replace(/\.[^.]+$/, ""));
    if (students > 0 && material.length === 0) stranded += 1;
    rows.push([c.section_name, String(students), material.join(", ") || "none", String(convs.filter((v) => v.class_id === c.id).length)]);
  }
  console.log(table(rows));
  // The one number on this page worth acting on today.
  console.log(`\nsections with students and no material: ${stranded}`);
}

// ───────────────────────────────────────────────────────────────── students
async function students() {
  heading("STUDENTS");
  const users = must(await db.from("users").select("id, role, display_name"), "users");
  const attempts = must(
    await db.from("practice_attempts").select("student_id, graded_result, generated_question_id, created_at"),
    "practice_attempts",
  );
  const turns = must(
    await db.from("conversation_turns").select("intent, role, conversations!inner(student_id)"),
    "conversation_turns",
  );

  const pupils = users.filter((u) => u.role === "student");
  const staffIds = new Set(users.filter((u) => u.role !== "student").map((u) => u.id));

  const rows = [["STUDENT", "ANSWERED", "CORRECT", "ASKED", "LAST ACTIVE"]];
  for (const p of pupils) {
    const mine = attempts.filter((a) => a.student_id === p.id);
    const correct = mine.filter((a) => (a.graded_result as { correct?: boolean })?.correct === true).length;
    const asked = turns.filter(
      (t) => t.role === "user" && (t.conversations as unknown as { student_id: string }).student_id === p.id,
    ).length;
    const last = mine.map((a) => a.created_at).sort().at(-1);
    rows.push([p.display_name ?? "—", String(mine.length), String(correct), String(asked), last?.slice(0, 16).replace("T", " ") ?? "never"]);
  }
  console.log(table(rows));

  // Staff attempts are excluded by every analytics function, so the raw table
  // disagrees with every page. Stated here so the difference is never a
  // surprise mid-investigation.
  const staffAttempts = attempts.filter((a) => staffIds.has(a.student_id)).length;
  console.log(`\n${attempts.length} attempts in the table; ${staffAttempts} are staff and excluded from every figure a teacher sees.`);
}

// ──────────────────────────────────────────────────────────────────── pages
async function pages() {
  heading("PAGES — what a real account sees");
  if (!asEmail) {
    console.log("Skipped. Pass --as=<staff email> to sign in and ask what their screen asks.");
    console.log("Without it these functions return [] to the service role whether they work or not,");
    console.log("which is why an audit that omits this can confirm a table and prove nothing.");
    return;
  }

  const me = await asUser(asEmail, env);
  console.log(`acting as ${asEmail}\n`);

  const learning = must(await me.rpc("teacher_learning_analytics"), "teacher_learning_analytics") as {
    overall: { attempts: number; correct: number; studentsEnrolled: number; studentsActive: number };
    bySection: { section: string; attempts: number; correct: number; active: number }[];
    // Optional: added by 0039, so a database that predates it returns no key.
    sharedStudents?: { name: string; sections: string[] }[];
    assistant: { intents: { intent: string; count: number }[] };
  } | null;

  if (!learning) {
    console.log("teacher_learning_analytics returned null — this account is not staff, or owns no classes.");
  } else {
    const o = learning.overall;
    console.log(`class accuracy: ${o.correct} of ${o.attempts}   students ${o.studentsActive}/${o.studentsEnrolled} active`);
    console.log("\n" + table([["SECTION", "ANSWERS", "CORRECT", "ACTIVE"], ...learning.bySection.map((s) => [s.section, String(s.attempts), String(s.correct), String(s.active)])]));
    // The section rows sum to the total only because an answer that could
    // belong to two sections is counted in one (0039). Asserted rather than
    // printed: an audit that shows the parts without checking they make the
    // whole is the same silence this tool exists to remove.
    const summed = learning.bySection.reduce((n, s) => n + s.attempts, 0);
    console.log(
      summed === learning.overall.attempts
        ? `\nsections sum to ${summed}, matching the total`
        : `\nMISMATCH: sections sum to ${summed} but the total is ${learning.overall.attempts}`,
    );
    for (const sh of learning.sharedStudents ?? []) {
      console.log(`  ${sh.name} is in ${sh.sections.join(" and ")} — answers counted once, in ${sh.sections[0]}`);
    }

    console.log("\nassistant: " + learning.assistant.intents.map((i) => `${i.intent} ${i.count}`).join(", "));
  }

  const progress = must(await me.rpc("teacher_student_progress"), "teacher_student_progress") as { name: string; attempts: number; correct: number }[];
  console.log("\n" + table([["STUDENT", "ANSWERED", "CORRECT"], ...progress.map((p) => [p.name, String(p.attempts), String(p.correct)])]));

  const codes = must(await me.rpc("teacher_class_codes"), "teacher_class_codes") as { section: string; students: number; materials: string[] }[];
  console.log("\n" + table([["SECTION", "STUDENTS", "MATERIAL"], ...codes.map((c) => [c.section, String(c.students), (c.materials ?? []).join(", ") || "none"])]));

  await me.auth.signOut();
}

// ────────────────────────────────────────────────────────────────── visuals
//
// Which sections a teacher has re-illustrated, and whether the gate holds.
//
// The gate is checked by CALLING it, not by looking for the function: an RPC
// that exists and refuses everyone looks identical to one that works, until a
// teacher tries to use it. The service role carries no auth.uid(), so this is
// exactly the unauthenticated case, and the only correct answer is a refusal.
async function visuals() {
  heading("VISUALS");

  const rows = must(await db.from("section_visuals").select("chunk_id, visual, set_by, set_at"), "section_visuals");
  if (rows.length === 0) {
    console.log("No teacher has overridden a section's illustration. Every lesson shows what matching picked.");
  } else {
    const chunks = must(await db.from("corpus_chunks").select("id, heading, document_id"), "corpus_chunks");
    const docs = must(await db.from("corpus_documents").select("id, source_file"), "corpus_documents");
    const staff = must(await db.from("users").select("id, display_name"), "users");
    console.log(table([
      ["DECK", "SECTION", "SHOWS", "SET BY"],
      ...rows.map((r) => {
        const c = chunks.find((x) => x.id === r.chunk_id);
        return [
          docs.find((d) => d.id === c?.document_id)?.source_file ?? "?",
          c?.heading ?? "?",
          r.visual ?? "(nothing — deliberately)",
          staff.find((u) => u.id === r.set_by)?.display_name ?? "?",
        ];
      }),
    ]));
  }

  // Any uuid: the role check runs before the ownership check, so a caller with
  // no identity is refused before the chunk id is ever looked at.
  const refused = await db.rpc("teacher_set_section_visual", {
    p_chunk_id: "00000000-0000-0000-0000-000000000000",
    p_visual: "lever",
    p_explicit: true,
  });
  if (refused.error) throw new Error(`teacher_set_section_visual is missing or broken: ${refused.error.message}`);
  const verdict = refused.data as { ok?: boolean; error?: string };
  console.log("");
  console.log(
    verdict.ok
      ? "⚠ a caller with no identity was ALLOWED to set a visual"
      : `a caller with no identity is refused: ${verdict.error}`,
  );
}

// ─────────────────────────────────────────────────────────────────── health
async function health() {
  heading("HEALTH");
  const errors = must(await db.from("app_errors").select("area, message, count, last_seen"), "app_errors");
  if (errors.length === 0) {
    console.log("app_errors: nothing recorded — no failure reported since recording began.");
  } else {
    console.log(table([["AREA", "COUNT", "MESSAGE"], ...errors.map((e) => [e.area, String(e.count), e.message.slice(0, 70)])]));
  }

  const usage = must(await db.from("ai_usage").select("user_id, day, kind, calls"), "ai_usage");
  const users = must(await db.from("users").select("id, display_name, role"), "users");
  console.log("\n" + table([
    ["DAY", "WHO", "KIND", "CALLS"],
    ...usage.map((u) => {
      const who = users.find((x) => x.id === u.user_id);
      return [u.day, `${who?.display_name ?? "?"} (${who?.role ?? "?"})`, u.kind, String(u.calls)];
    }),
  ]));
}

const run: Record<string, () => Promise<void>> = { corpus, classes, students, pages, visuals, health };
for (const s of sections) await run[s]();
console.log();
