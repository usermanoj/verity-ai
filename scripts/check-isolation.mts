/**
 * Does a second teacher see only their own class?
 *
 *   npx tsx scripts/check-isolation.mts          # seed, assert, tear down
 *   npx tsx scripts/check-isolation.mts --keep   # leave the accounts in place
 *
 * Every RLS policy and every SECURITY DEFINER function in this project scopes
 * by teacher_id or by enrolment. With ONE teacher in the database, "sees their
 * own students" and "sees every student" produce identical output — so none of
 * that scoping has ever been tested, and it is the part where a mistake means
 * one school's staff reading another class's children.
 *
 * This creates a second teacher with their own class and pupils, asks the same
 * questions their screen asks, and checks the answers stop at their own
 * boundary. Then it removes them, so the school's data is as it was.
 *
 * The accounts are synthetic and cannot sign in with Google — they exist to
 * exercise the boundary, not to simulate learning. Real usage still needs real
 * people; this only proves the walls are where they are supposed to be.
 */
import { adminClient, asUser, loadEnv, must, optional } from "./lib/audit-db.mts";

const KEEP = process.argv.includes("--keep");
const TAG = "isolation-check";
const env = loadEnv();
const db = adminClient(env);

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"}  ${name}`);
  if (!ok) console.log(`        ${detail}`);
}

const created: { users: string[]; classes: string[]; courses: string[] } = { users: [], classes: [], courses: [] };

async function teardown() {
  if (KEEP) {
    console.log("\n--keep given: accounts left in place.");
    return;
  }
  // Users first: enrolments and conversations cascade from them, and the class
  // rows are only safe to remove once nobody is in them.
  for (const id of created.users) await db.auth.admin.deleteUser(id);
  if (created.classes.length) await db.from("classes").delete().in("id", created.classes);
  if (created.courses.length) await db.from("courses").delete().in("id", created.courses);
  await db.from("staff_allowlist").delete().like("email", `%${TAG}%`);
  console.log(`\nremoved ${created.users.length} account(s), ${created.classes.length} class(es), ${created.courses.length} course(s)`);
}

try {
  const schoolId = must(await db.from("schools").select("id"), "schools")[0].id;

  // ── the incumbent, whose data must stay private ──────────────────────────
  const incumbent = must(
    await db.from("users").select("id, display_name").in("role", ["teacher", "hod", "principal"]),
    "existing staff",
  )[0];
  const theirStudent = must(await db.from("users").select("id, display_name").eq("role", "student"), "existing students")[0];
  const theirClasses = must(await db.from("classes").select("id, section_name").eq("teacher_id", incumbent.id), "their classes");
  const theirDoc = must(await db.from("corpus_documents").select("id, source_file"), "documents")[0];
  console.log(`incumbent: ${incumbent.display_name} — ${theirClasses.length} classes, student ${theirStudent.display_name}`);

  // ── a second teacher, with their own class and pupils ────────────────────
  console.log("\nseeding");
  const teacherEmail = `teacher.${TAG}@example.test`;
  const teacher = await db.auth.admin.createUser({ email: teacherEmail, email_confirm: true });
  if (teacher.error) throw teacher.error;
  created.users.push(teacher.data.user.id);
  must(
    await db.from("users").insert({ id: teacher.data.user.id, school_id: schoolId, role: "teacher", sso_subject: teacher.data.user.id, display_name: "Second Teacher" }).select("id"),
    "insert teacher row",
  );

  const course = must(
    await db.from("courses").insert({ school_id: schoolId, subject: "Physics", grade: "Grade 8", academic_year: "2026" }).select("id"),
    "insert course",
  )[0];
  created.courses.push(course.id);
  const klass = must(
    await db.from("classes").insert({ school_id: schoolId, course_id: course.id, section_name: `8Z-${TAG}`, teacher_id: teacher.data.user.id }).select("id"),
    "insert class",
  )[0];
  created.classes.push(klass.id);

  const pupilIds: string[] = [];
  for (let i = 1; i <= 3; i += 1) {
    const p = await db.auth.admin.createUser({ email: `pupil${i}.${TAG}@example.test`, email_confirm: true });
    if (p.error) throw p.error;
    created.users.push(p.data.user.id);
    pupilIds.push(p.data.user.id);
    must(
      await db.from("users").insert({ id: p.data.user.id, school_id: schoolId, role: "student", sso_subject: p.data.user.id, display_name: `Pupil ${i}` }).select("id"),
      "insert pupil row",
    );
    must(await db.from("class_enrollments").insert({ class_id: klass.id, student_id: p.data.user.id }).select("class_id"), "enrol pupil");
  }
  console.log(`  second teacher + 3 pupils in 8Z-${TAG}`);

  // ── what the second teacher can see ──────────────────────────────────────
  console.log("\nas the second teacher");
  const them = await asUser(teacherEmail, env);

  const progress = must(await them.rpc("teacher_student_progress"), "teacher_student_progress") as { name: string }[];
  const names = progress.map((p) => p.name);
  check(
    "student list contains only their own pupils",
    names.length === 3 && !names.includes(theirStudent.display_name ?? ""),
    `saw: ${names.join(", ") || "nobody"}`,
  );

  const detail = must(await them.rpc("teacher_student_detail", { p_student_id: theirStudent.id }), "teacher_student_detail") as { allowed: boolean };
  check("refused another teacher's pupil's transcript", detail.allowed === false, `allowed=${detail.allowed}`);

  const timeline = must(await them.rpc("teacher_student_timeline", { p_student_id: theirStudent.id }), "teacher_student_timeline") as { allowed: boolean; events: unknown[] };
  check("refused another teacher's pupil's timeline", timeline.allowed === false && timeline.events.length === 0, `allowed=${timeline.allowed}, ${timeline.events.length} events`);

  const codes = must(await them.rpc("teacher_class_codes"), "teacher_class_codes") as { section: string }[];
  check(
    "class list contains only their own section",
    codes.length === 1 && codes[0].section === `8Z-${TAG}`,
    `saw: ${codes.map((c) => c.section).join(", ") || "none"}`,
  );

  const material = must(await them.rpc("teacher_material_list", { p_limit: 30 }), "teacher_material_list") as unknown[];
  check("material list is empty — they have uploaded nothing", material.length === 0, `saw ${material.length} document(s)`);

  const learning = optional(await them.rpc("teacher_learning_analytics"), "teacher_learning_analytics") as { overall: { attempts: number } } | null;
  check("analytics exclude the other teacher's answers", (learning?.overall.attempts ?? 0) === 0, `overall attempts = ${learning?.overall.attempts}`);

  const move = must(await them.rpc("teacher_set_document_sections", { p_document_id: theirDoc.id, p_class_ids: [klass.id] }), "teacher_set_document_sections") as { ok: boolean; error?: string };
  check("cannot move another teacher's material", move.ok === false && move.error === "not_found", JSON.stringify(move));

  const staff = must(await them.rpc("staff_list"), "staff_list") as unknown[];
  check("a teacher cannot read the staff list", staff.length === 0, `saw ${staff.length} row(s)`);

  const invite = must(await them.rpc("invite_staff", { p_email: "someone@example.test", p_role: "teacher" }), "invite_staff") as { ok: boolean; error?: string };
  check("a teacher cannot invite staff", invite.ok === false && invite.error === "not_allowed", JSON.stringify(invite));

  await them.auth.signOut();

  // ── and the incumbent is unaffected ──────────────────────────────────────
  console.log("\nas the incumbent");
  const incumbentEmail = (await db.auth.admin.listUsers()).data.users.find((u) => u.id === incumbent.id)?.email;
  if (incumbentEmail) {
    const me = await asUser(incumbentEmail, env);
    const mine = must(await me.rpc("teacher_student_progress"), "teacher_student_progress") as { name: string }[];
    check(
      "does not see the new teacher's pupils",
      !mine.some((p) => p.name.startsWith("Pupil ")),
      `saw: ${mine.map((p) => p.name).join(", ")}`,
    );
    await me.auth.signOut();
  }
} finally {
  await teardown();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
