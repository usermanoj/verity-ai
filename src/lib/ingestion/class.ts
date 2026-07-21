import { supabaseAdmin } from "@/lib/supabase/admin";

// Resolves the course and the uploader's section(s) for an upload, creating
// them on demand. There's still no class-management UI (out of scope — see
// ROADMAP.md §7), so sections are auto-provisioned the first time a teacher
// uploads for them, same spirit as DEFAULT_SCHOOL_ID for auth.
//
// A course is one (school, subject, grade, academic_year). A section (a
// `classes` row) is one (course, section_name) owned by exactly one teacher.
// A teacher may own several sections of the same course (7A + 7B); a section
// owned by a *different* teacher is never reused — that would silently push
// one teacher's material into another teacher's roster — so we reject with a
// clear message ("teacher-scoped sharing only"; cross-teacher/department
// sharing is a deliberate future extension).
export type ResolveResult = { ok: true; classIds: string[] } | { ok: false; error: string };

export async function resolveTeacherSections(
  teacherId: string,
  schoolId: string,
  subject: string,
  grade: string,
  academicYear: string,
  sectionNames: string[],
): Promise<ResolveResult> {
  const admin = supabaseAdmin();

  const courseId = await getOrCreateCourse(admin, schoolId, subject, grade, academicYear);

  const classIds: string[] = [];
  for (const name of sectionNames) {
    const { data: existing } = await admin
      .from("classes")
      .select("id, teacher_id")
      .eq("course_id", courseId)
      .eq("section_name", name)
      .maybeSingle();

    if (existing) {
      if (existing.teacher_id && existing.teacher_id !== teacherId) {
        return {
          ok: false,
          error: `Section "${name}" of ${grade} ${subject} (${academicYear}) is managed by another teacher.`,
        };
      }
      classIds.push(existing.id);
      continue;
    }

    const { data: created, error } = await admin
      .from("classes")
      .insert({ school_id: schoolId, course_id: courseId, section_name: name, teacher_id: teacherId })
      .select("id")
      .single();
    if (error || !created) throw error ?? new Error(`Failed to create section ${name}`);
    classIds.push(created.id);
  }

  return { ok: true, classIds };
}

async function getOrCreateCourse(
  admin: ReturnType<typeof supabaseAdmin>,
  schoolId: string,
  subject: string,
  grade: string,
  academicYear: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("courses")
    .select("id")
    .eq("school_id", schoolId)
    .eq("subject", subject)
    .eq("grade", grade)
    .eq("academic_year", academicYear)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await admin
    .from("courses")
    .insert({ school_id: schoolId, subject, grade, academic_year: academicYear })
    .select("id")
    .single();
  if (created) return created.id;

  // A concurrent upload may have created the same course between our select
  // and insert (the unique constraint would reject ours) — re-select rather
  // than fail the upload.
  const { data: raced } = await admin
    .from("courses")
    .select("id")
    .eq("school_id", schoolId)
    .eq("subject", subject)
    .eq("grade", grade)
    .eq("academic_year", academicYear)
    .maybeSingle();
  if (raced) return raced.id;

  throw error ?? new Error("Failed to create course");
}
