import { supabaseAdmin, hasSupabaseAdmin } from "@/lib/supabase/admin";
import type { AppUser } from "@/lib/auth";
import { TOPICS } from "@/data/corpus";

// Who may see which approved material.
//
// Until now, nothing enforced this. Student-facing pages were not gated at
// all, so any approved document was readable by anyone who had — or guessed —
// its topic URL. For a product whose whole promise is "your school's material,
// under your control", that is the hole worth closing first.
//
// The check lives here rather than in RLS because every corpus read goes
// through the service-role client, which bypasses RLS by design (the ingest
// pipeline needs it). Bypassing RLS means the scoping has to be explicit and
// in one place — this file — rather than assumed.

// "all" means an unrestricted viewer: a teacher previewing their own class's
// material, or a head of department who oversees it. A Set means exactly
// these document ids and nothing else.
export type Visibility = "all" | Set<string>;

const STAFF = new Set(["teacher", "hod", "principal"]);

export async function visibleDocuments(user: AppUser | null): Promise<Visibility> {
  // A signed-out viewer sees nothing. Routes redirect before reaching here,
  // so this is a backstop rather than the primary gate — but a backstop that
  // fails closed is the point.
  if (!user) return new Set<string>();
  if (STAFF.has(user.role)) return "all";
  if (!hasSupabaseAdmin()) return new Set<string>();

  // A student sees the approved material of the classes they are enrolled in.
  // With no enrolment they see nothing, which is correct: until class join
  // codes land, no student has been placed in a class, and showing them the
  // school's material anyway is precisely the behaviour being fixed.
  const { data: enrolments } = await supabaseAdmin()
    .from("class_enrollments")
    .select("class_id")
    .eq("student_id", user.id);

  const classIds = (enrolments ?? []).map((e) => e.class_id);
  if (classIds.length === 0) return new Set<string>();

  const { data: mapped } = await supabaseAdmin()
    .from("corpus_document_sections")
    .select("document_id")
    .in("class_id", classIds);

  return new Set((mapped ?? []).map((m) => m.document_id));
}

// The two hand-built demo topics are seeded sample content, not a school's
// material, and are deliberately readable by any signed-in user — they are
// what a new teacher or a visitor is shown before anything is uploaded.
export function isDemoTopic(topicId: string): boolean {
  return Object.hasOwn(TOPICS, topicId);
}

export function canSee(visibility: Visibility, topicId: string): boolean {
  return isDemoTopic(topicId) || visibility === "all" || visibility.has(topicId);
}
