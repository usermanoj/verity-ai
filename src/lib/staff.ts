import type { AppRole } from "@/lib/auth";

// Who may grant staff access, and to what.
//
// Pure, and tested, because every rule here decides who can read children's
// transcripts. A mistake in this file is not a broken page — it is an
// unauthorised adult with a view of what a class has been asking a tutor.
//
// The SQL in 0034 enforces the same rules independently. This is not
// duplication for its own sake: a check that lives only in TypeScript is a
// check that a future route handler can forget to call, and one that lives only
// in SQL cannot tell the UI which buttons to show.

export type StaffRole = Extract<AppRole, "teacher" | "hod" | "principal">;
export const STAFF_ROLES: StaffRole[] = ["teacher", "hod", "principal"];

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as string[]).includes(role);
}

/**
 * The roles this person may invite others into.
 *
 * Mirrors how a school delegates: a principal appoints leadership, a head of
 * department brings in their own teachers. A teacher invites nobody.
 *
 * Note what this forbids by construction — an HOD cannot create another HOD or
 * a principal, so no staff member can manufacture a peer with authority over
 * them, and nobody can promote themselves.
 */
export function invitableRoles(inviter: AppRole): StaffRole[] {
  switch (inviter) {
    case "principal":
      return ["teacher", "hod", "principal"];
    case "hod":
      return ["teacher"];
    default:
      return [];
  }
}

export function canInvite(inviter: AppRole, target: string): target is StaffRole {
  return isStaffRole(target) && invitableRoles(inviter).includes(target);
}

/**
 * Whether this person may withdraw that grant.
 *
 * Nobody may revoke their own, whatever their role. A principal who removes
 * themselves by mistake locks the school out of its own staff list, and the
 * only way back is the bootstrap env var and a redeploy — an accident with a
 * recovery path that involves a deploy is worth preventing outright.
 */
// Takes `isSelf` rather than comparing emails, because public.users has no
// email column — the address lives in auth.users, which only a SECURITY DEFINER
// function can read. So SQL decides who "you" are and this decides what you may
// do, which is the right split anyway: identity is a fact, permission is a rule.
export function canRevoke(
  actorRole: AppRole,
  grant: { role: string; source: string; isSelf: boolean },
): boolean {
  if (grant.isSelf) return false;

  // A bootstrap principal is held in an environment variable, not in this
  // table. Revoking the row would appear to work and be undone at their next
  // sign-in, which is worse than refusing — a control that silently does
  // nothing is how people come to believe access was removed when it was not.
  if (grant.source === "bootstrap") return false;

  if (actorRole === "principal") return true;
  // An HOD may withdraw a teacher, matching what they may grant. Letting them
  // remove a peer or a principal would make the invite rules pointless: you
  // could not create an HOD but you could delete every one of them.
  if (actorRole === "hod") return grant.role === "teacher";
  return false;
}

/** A plausible email, checked before we put it in front of a person as a grant. */
export function normaliseEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  // Deliberately loose. Validating email properly is famously impossible, and
  // the cost of a wrong rejection here is a real teacher who cannot be added;
  // the cost of a wrong acceptance is a row that never matches anyone.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}
