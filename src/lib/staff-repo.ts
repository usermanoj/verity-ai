import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/supabase/config";
import { reportError } from "@/lib/errors/report";

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
    return (data as StaffGrant[] | null) ?? [];
  } catch (err) {
    // An empty list here renders as "this school has no staff", which is a lie
    // someone would act on — the same fault as the material list and the class
    // codes before it.
    await reportError("auth", err, "could not load the staff list");
    return [];
  }
}
