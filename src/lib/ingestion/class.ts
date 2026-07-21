import { supabaseAdmin } from "@/lib/supabase/admin";

// There's no class-management UI yet (out of scope for the ingestion
// pipeline — see ROADMAP.md §7), so a teacher's first upload auto-
// provisions their one class. This is a deliberate single-pilot-school
// simplification, same spirit as DEFAULT_SCHOOL_ID for auth provisioning:
// reasonable for one school's one class per teacher, not a real multi-class
// roster system.
export async function getOrCreateTeacherClass(
  teacherId: string,
  schoolId: string,
  subject: string,
  grade: string,
): Promise<string> {
  const admin = supabaseAdmin();

  const { data: existing } = await admin.from("classes").select("id").eq("teacher_id", teacherId).maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await admin
    .from("classes")
    .insert({ school_id: schoolId, subject, grade, teacher_id: teacherId })
    .select("id")
    .single();
  if (error || !created) throw error ?? new Error("Failed to create class");
  return created.id;
}
