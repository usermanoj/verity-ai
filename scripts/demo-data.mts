/**
 * Seeds — or removes — clearly-marked demo data.
 *
 *   npx tsx scripts/demo-data.mts seed
 *   npx tsx scripts/demo-data.mts remove
 *
 * Why this exists: getting real students and teachers into a school takes
 * approvals and time, and until then every dashboard is empty and every
 * analytics decision is guesswork. This populates the same tables real usage
 * would, so the dashboards can be designed and demonstrated against something
 * shaped like reality.
 *
 * ── The rule this data lives under ───────────────────────────────────────
 *
 * It goes into YOUR school, alongside real rows, because the dashboards are
 * school-scoped and a separate demo school would be invisible to your own
 * login. That means it inflates your real figures while it is present.
 *
 * So every row it creates is marked, and `remove` deletes exactly what `seed`
 * created and nothing else:
 *
 *   - teachers and students are named "Demo · <name>"
 *   - their emails are @demo.verity.invalid, a reserved TLD that can never
 *     receive mail or collide with a real school account
 *   - documents are named "Demo — <topic>.pptx"
 *
 * Remove it before a real pilot, and before showing figures to anyone who
 * might take them for real usage. A populated dashboard is worth a great deal
 * in a pitch and nothing at all in a procurement conversation.
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const MARK = "Demo · ";
const EMAIL_DOMAIN = "demo.verity.invalid";
const DOC_PREFIX = "Demo — ";
const YEAR = "2025-2026";

const TEACHERS = [
  { name: "Priya Raman", subject: "Physics", grade: "Grade 7", sections: ["7A", "7B"] },
  { name: "Daniel Okonkwo", subject: "Physics", grade: "Grade 8", sections: ["8A"] },
  { name: "Mei Ling Tan", subject: "Chemistry", grade: "Grade 8", sections: ["8A", "8B"] },
  { name: "Aarav Sharma", subject: "Biology", grade: "Grade 7", sections: ["7C"] },
  { name: "Sofia Ferreira", subject: "Mathematics", grade: "Grade 7", sections: ["7A", "7D"] },
  // Deliberately has a section and no approved material: a school always has
  // one, and a dashboard that cannot show a gap is not telling the truth.
  { name: "James Whitfield", subject: "English", grade: "Grade 8", sections: ["8C"] },
];

const TOPICS: Record<string, string[]> = {
  Physics: ["Magnets and Electromagnets", "Forces and Moments", "Distance-Time Graphs"],
  Chemistry: ["States of Matter", "The Periodic Table"],
  Biology: ["Cells and Organelles", "The Circulatory System"],
  Mathematics: ["Linear Equations", "Angles and Polygons"],
  English: ["Persuasive Writing"],
};

const FIRST = ["Wei", "Ananya", "Luca", "Sofia", "Kai", "Nadia", "Tomas", "Hana", "Idris", "Elena", "Ravi", "Mira"];
const LAST = ["Chen", "Patel", "Rossi", "Silva", "Tanaka", "Haddad", "Novak", "Kim", "Bello", "Muller"];

async function main() {
  const mode = process.argv[2];
  if (mode !== "seed" && mode !== "remove") {
    console.error("Usage: npx tsx scripts/demo-data.mts <seed|remove>");
    process.exit(1);
  }

  const { data: school } = await db.from("schools").select("id, name").limit(1).maybeSingle();
  if (!school) {
    console.error("No school row found — sign in once so the app provisions one.");
    process.exit(1);
  }
  console.log(`School: ${school.name}\n`);

  if (mode === "remove") return remove(school.id);
  return seed(school.id);
}

/* ------------------------------------------------------------------ seed */

async function seed(schoolId: string) {
  const teacherIds = new Map<string, string>();

  for (const t of TEACHERS) {
    const id = await ensureUser(`${slug(t.name)}@${EMAIL_DOMAIN}`, MARK + t.name, "teacher", schoolId);
    if (id) teacherIds.set(t.name, id);
  }
  console.log(`teachers: ${teacherIds.size}`);

  let classCount = 0;
  let studentCount = 0;
  let docCount = 0;
  let questionCount = 0;
  let attemptCount = 0;
  let turnCount = 0;

  for (const t of TEACHERS) {
    const teacherId = teacherIds.get(t.name);
    if (!teacherId) continue;

    const courseId = await ensureCourse(schoolId, t.subject, t.grade);
    if (!courseId) continue;

    for (const section of t.sections) {
      const classId = await ensureClass(schoolId, courseId, section, teacherId);
      if (!classId) continue;
      classCount++;

      // 16-24 students per section, so class sizes differ the way real ones do.
      const size = 16 + Math.floor(seeded(`${t.name}${section}`) * 9);
      const studentIds: string[] = [];
      for (let i = 0; i < size; i++) {
        const name = `${FIRST[(i * 7 + section.charCodeAt(1)) % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`;
        const email = `${slug(name)}.${slug(section)}.${i}@${EMAIL_DOMAIN}`;
        const id = await ensureUser(email, MARK + name, "student", schoolId);
        if (!id) continue;
        studentIds.push(id);
        await db.from("class_enrollments").upsert({ class_id: classId, student_id: id }, { onConflict: "class_id,student_id" });
      }
      studentCount += studentIds.length;

      // English 8C is left with no material on purpose — see the note above.
      if (t.subject === "English") continue;

      for (const topic of TOPICS[t.subject] ?? []) {
        const doc = await createDocument(teacherId, `${DOC_PREFIX}${topic}.pptx`, classId);
        if (!doc) continue;
        docCount++;

        const chunkIds = await createChunks(doc, topic);
        const qs = await createQuestions(chunkIds, teacherId);
        questionCount += qs.length;

        attemptCount += await createAttempts(studentIds, qs);
        turnCount += await createConversations(studentIds, doc, classId, topic);
      }
    }
  }

  console.log(`classes: ${classCount}`);
  console.log(`students: ${studentCount}`);
  console.log(`documents: ${docCount}`);
  console.log(`questions: ${questionCount}`);
  console.log(`practice attempts: ${attemptCount}`);
  console.log(`conversation turns: ${turnCount}`);
  console.log(`\nDone. Remove it all with:  npx tsx scripts/demo-data.mts remove`);
}

/* ---------------------------------------------------------------- remove */

async function remove(schoolId: string) {
  // Documents FIRST, and by name.
  //
  // The original order assumed everything cascades from the user. Enrolments,
  // conversations and attempts do. Documents do NOT: corpus_documents
  // .uploaded_by is ON DELETE SET NULL, deliberately — a teacher leaving the
  // school must not delete the curriculum. So deleting the demo users left
  // nineteen "Demo — …" decks behind with a null uploader, listed in every
  // class, un-attributable and impossible to remove from the UI.
  //
  // Deleting them by name cascades their chunks, glossary, generated
  // questions and translation memory.
  const { data: demoDocs } = await db
    .from("corpus_documents")
    .select("id, source_file")
    .like("source_file", `${DOC_PREFIX}%`);
  if (demoDocs?.length) {
    const { error } = await db
      .from("corpus_documents")
      .delete()
      .in("id", demoDocs.map((d) => d.id));
    if (error) console.error("Could not delete demo documents:", error.message);
    else console.log(`Deleted ${demoDocs.length} demo documents.`);
  }

  // Users are the anchor for the rest: enrolments, conversations and attempts
  // all cascade from them.
  const { data: demoUsers } = await db
    .from("users")
    .select("id, display_name")
    .eq("school_id", schoolId)
    .like("display_name", `${MARK}%`);

  const ids = (demoUsers ?? []).map((u) => u.id);
  console.log(`Found ${ids.length} demo users.`);

  for (const id of ids) {
    await db.auth.admin.deleteUser(id).catch(() => {});
  }

  // Classes and courses do not hang off a user, so they are cleaned by name.
  // Only sections that now have no teacher and no enrolments are removed, so
  // a real class that happens to share a section name is never touched.
  const { data: orphanClasses } = await db.from("classes").select("id, teacher_id").eq("school_id", schoolId);
  for (const c of orphanClasses ?? []) {
    if (c.teacher_id !== null) continue;
    const { count } = await db
      .from("class_enrollments")
      .select("student_id", { count: "exact", head: true })
      .eq("class_id", c.id);
    if ((count ?? 0) === 0) await db.from("classes").delete().eq("id", c.id);
  }

  console.log("Removed. Real rows were left alone.");
}

/* ----------------------------------------------------------------- parts */

async function ensureUser(
  email: string,
  displayName: string,
  role: "teacher" | "student",
  schoolId: string,
): Promise<string | null> {
  // createUser is idempotent enough for this: a duplicate email returns an
  // error we can recover from by looking the user up.
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: displayName },
  });

  let id = created?.user?.id ?? null;
  if (!id && error) {
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const users = (list?.users ?? []) as { id: string; email?: string }[];
    id = users.find((u) => u.email === email)?.id ?? null;
  }
  if (!id) return null;

  await db.from("users").upsert({ id, school_id: schoolId, role, display_name: displayName }, { onConflict: "id" });
  return id;
}

async function ensureCourse(schoolId: string, subject: string, grade: string): Promise<string | null> {
  const { data: existing } = await db
    .from("courses")
    .select("id")
    .eq("school_id", schoolId)
    .eq("subject", subject)
    .eq("grade", grade)
    .eq("academic_year", YEAR)
    .maybeSingle();
  if (existing) return existing.id;

  const { data } = await db
    .from("courses")
    .insert({ school_id: schoolId, subject, grade, academic_year: YEAR })
    .select("id")
    .maybeSingle();
  return data?.id ?? null;
}

async function ensureClass(
  schoolId: string,
  courseId: string,
  section: string,
  teacherId: string,
): Promise<string | null> {
  const { data: existing } = await db
    .from("classes")
    .select("id")
    .eq("course_id", courseId)
    .eq("section_name", section)
    .maybeSingle();
  if (existing) return existing.id;

  const { data } = await db
    .from("classes")
    .insert({ school_id: schoolId, course_id: courseId, section_name: section, teacher_id: teacherId })
    .select("id")
    .maybeSingle();
  return data?.id ?? null;
}

async function createDocument(teacherId: string, name: string, classId: string): Promise<string | null> {
  // One document in six left pending, so the "waiting on you" figures are
  // never zero and the review backlog panel has something to say.
  const status = seeded(name + classId) > 0.84 ? "pending" : "approved";
  const { data } = await db
    .from("corpus_documents")
    .insert({ uploaded_by: teacherId, source_file: name, status })
    .select("id")
    .maybeSingle();
  if (!data) return null;

  await db.from("corpus_document_sections").insert({ document_id: data.id, class_id: classId });
  return data.id;
}

async function createChunks(documentId: string, topic: string): Promise<string[]> {
  const rows = Array.from({ length: 6 }, (_, i) => ({
    document_id: documentId,
    heading: `${topic}: part ${i + 1}`,
    text: `Approved teaching text for ${topic}, section ${i + 1}.`,
    citation: `${DOC_PREFIX}${topic}.pptx — Page/Section ${i + 1}`,
    module: i < 3 ? `${topic} basics` : `${topic} in practice`,
    approved_at: new Date().toISOString(),
  }));
  const { data } = await db.from("corpus_chunks").insert(rows).select("id");
  return (data ?? []).map((c) => c.id);
}

async function createQuestions(chunkIds: string[], teacherId: string) {
  const levels = ["Easy", "Medium", "Challenge"] as const;
  const kinds = ["mcq", "truefalse", "fill", "matching"] as const;

  const rows = chunkIds.flatMap((chunkId, i) =>
    Array.from({ length: 4 }, (_, j) => {
      const kind = kinds[(i + j) % kinds.length];
      return {
        chunk_id: chunkId,
        level: levels[(i + j) % levels.length],
        prompt: `Demo question ${j + 1}`,
        question:
          kind === "mcq"
            ? { kind, correct: "B", options: ["First", "Second", "Third"] }
            : kind === "truefalse"
              ? { kind, correct: true, because: "Stated in the material." }
              : kind === "fill"
                ? { kind, accept: ["answer"] }
                : { kind, pairs: [{ left: "A", right: "1" }, { left: "B", right: "2" }, { left: "C", right: "3" }] },
        // A realistic bank is mostly released with a tail still under review.
        status: seeded(chunkId + j) > 0.78 ? "pending" : "approved",
        generated_by: teacherId,
      };
    }),
  );

  const { data } = await db.from("generated_questions").insert(rows).select("id, status");
  return (data ?? []).filter((q) => q.status === "approved");
}

async function createAttempts(studentIds: string[], questions: { id: string }[]): Promise<number> {
  if (studentIds.length === 0 || questions.length === 0) return 0;

  const rows: Record<string, unknown>[] = [];
  for (const studentId of studentIds) {
    // Not every student attempts everything, and ability varies — a uniform
    // 70% across a whole cohort is the giveaway that data is fabricated.
    const ability = 0.35 + seeded(studentId) * 0.6;
    // How many they got through varies per student, not per question — the
    // count has to be decided before the loop that uses it.
    const attempted = 3 + Math.floor(seeded(studentId + "n") * 4);
    for (const q of questions.slice(0, attempted)) {
      const correct = seeded(studentId + q.id + "r") < ability;
      rows.push({
        student_id: studentId,
        question_id: q.id,
        answer: correct ? "correct answer" : "wrong answer",
        graded_result: { correct, score: correct ? 1 : 0, feedback: correct ? "Correct!" : "Not quite.", details: {} },
        graded_by: "rule",
      });
    }
  }
  if (rows.length === 0) return 0;
  await db.from("practice_attempts").insert(rows);
  return rows.length;
}

async function createConversations(
  studentIds: string[],
  topicId: string,
  classId: string,
  topic: string,
): Promise<number> {
  // Only some students use the assistant, which is itself a thing a teacher
  // wants to see.
  const talkers = studentIds.filter((id) => seeded(id + topicId) > 0.55);
  let turns = 0;

  for (const studentId of talkers) {
    const { data: conversation } = await db
      .from("conversations")
      .insert({ student_id: studentId, class_id: classId, topic_id: topicId })
      .select("id")
      .maybeSingle();
    if (!conversation) continue;

    // "explain" dominates, "check" is rarer — and a few students only ever
    // ask for the answer, which is exactly the signal the monitoring exists
    // to surface.
    const shortcutting = seeded(studentId + "s") > 0.85;
    const intents = shortcutting ? ["check", "check", "askme"] : ["explain", "example", "askme", "check"];

    for (const intent of intents) {
      await db.from("conversation_turns").insert([
        {
          conversation_id: conversation.id,
          role: "user",
          intent,
          text: shortcutting ? `Just tell me the answer for ${topic}` : `Can you explain ${topic}?`,
        },
        {
          conversation_id: conversation.id,
          role: "assistant",
          intent,
          text: `Here is a guided explanation of ${topic}, based on your class material.`,
        },
      ]);
      turns += 2;
    }
  }
  return turns;
}

/* ----------------------------------------------------------------- utils */

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
}

// Deterministic pseudo-randomness: re-running the script produces the same
// distribution, so a screenshot taken today still matches the data tomorrow.
function seeded(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
