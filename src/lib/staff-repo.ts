import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/supabase/config";
import { reportError } from "@/lib/errors/report";
import { bootstrapPrincipals } from "@/lib/bootstrap-staff";

export type StaffGrant = {
  email: string;
  role: string;
  source: string;
  invitedAt: string;
  invitedBy: string | null;
  claimedAt: string | null;
  claimedName: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  /** Computed in SQL from auth.users, which the app cannot read. */
  isSelf: boolean;
};

/**
 * The school's staff list, or an empty list if the caller may not see it.
 *
 * The RPC is role-gated, so an unauthorised caller gets `[]` rather than an
 * error — the page never needs to make the permission decision twice.
 */
export async function getStaffList(): Promise<StaffGrant[]> {
  if (!hasSupabase()) return [];
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc("staff_list");
    if (error) throw error;
    return withBootstrapPrincipals((data as StaffGrant[] | null) ?? []);
  } catch (err) {
    // An empty list here renders as "this school has no staff", which is a lie
    // someone would act on — the same fault as the material list and the class
    // codes before it.
    await reportError("auth", err, "could not load the staff list");
    return [];
  }
}

/**
 * Shows the environment variable's principals alongside the table's grants.
 *
 * They are not rows: the bootstrap no longer writes over anyone's grant, so the
 * variable stays the only control over it. But a staff page that omitted them
 * would be lying about who can see children's work, which is the one thing this
 * page exists to answer.
 *
 * Someone who is BOTH on the list and in the table keeps their row — their
 * invitation, who issued it, when it was taken up — with the role they are
 * actually operating at and a note of where it came from. Their underlying
 * grant is unchanged and returns the moment the variable does not name them.
 */
export function withBootstrapPrincipals(grants: StaffGrant[], raw?: string): StaffGrant[] {
  const bootstrapped = bootstrapPrincipals(raw);
  if (bootstrapped.size === 0) return grants;

  const seen = new Set(grants.map((g) => g.email.toLowerCase()));
  const merged = grants.map((g) =>
    bootstrapped.has(g.email.toLowerCase())
      ? { ...g, role: "principal", source: "bootstrap", revokedAt: null, revokedBy: null }
      : g,
  );

  for (const email of bootstrapped) {
    if (seen.has(email)) continue;
    merged.push({
      email,
      role: "principal",
      source: "bootstrap",
      invitedAt: "",
      invitedBy: null,
      // Unknowable without a row. Rendered as "not signed in yet", which for a
      // bootstrap principal reading their own staff page is visibly wrong —
      // and less wrong than inventing a date.
      claimedAt: null,
      claimedName: null,
      revokedAt: null,
      revokedBy: null,
      isSelf: false,
    });
  }
  return merged;
}
