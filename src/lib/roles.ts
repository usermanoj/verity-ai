import type { AppRole } from "@/lib/auth";

// Seniority, so a gate can mean "this role or above".
//
// Every role check used to be an equality test, which made the roles siblings
// rather than a hierarchy: a principal was refused entry to a teacher's page
// because they were not a teacher. That is not how a school works, and it made
// the bootstrap principal a trap — the one person who has to set the system up
// was locked out of most of it the moment they became senior enough to manage
// it.
//
// Class ownership is by user id, not by role (classes.teacher_id), so a
// principal who also runs a class keeps seeing exactly that class. Someone who
// runs none sees an empty teacher view, which is honest: those pages answer
// "how are MY classes doing", and the school-wide answer is /principal.

export const ROLE_RANK: Record<AppRole, number> = {
  student: 0,
  teacher: 1,
  hod: 2,
  principal: 3,
};

/**
 * Whether this person is at least this senior.
 *
 * Unknown or missing roles are refused rather than defaulting to a rank. A
 * role string this code does not recognise is a reason to say no — the failure
 * mode of guessing is an unauthorised adult reading children's work.
 */
export function atLeast(actual: string | null | undefined, minimum: AppRole): boolean {
  if (!actual || !(actual in ROLE_RANK)) return false;
  return ROLE_RANK[actual as AppRole] >= ROLE_RANK[minimum];
}

/** Staff are teachers and above. Students are not. */
export function isStaff(role: string | null | undefined): boolean {
  return atLeast(role, "teacher");
}

/**
 * The dashboard a viewer belongs to above the teaching area, or null.
 *
 * A plain teacher has none — this IS their home — and passing one would offer
 * them a page that redirects straight back.
 */
export function seniorHomeFor(role: string | null | undefined): string | null {
  if (role === "principal") return "/principal";
  if (role === "hod") return "/hod";
  return null;
}
