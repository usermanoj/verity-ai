import { redirect } from "next/navigation";
import { hasSupabase } from "./supabase/config";
import { supabaseServer } from "./supabase/server";

export type AppRole = "student" | "teacher" | "hod" | "principal";

export type AppUser = {
  id: string;
  email: string | null;
  role: AppRole;
  schoolId: string;
  displayName: string | null;
};

// Returns null when Supabase isn't configured (dormant — see hasSupabase())
// or when nobody is signed in. Never throws.
export async function getCurrentAppUser(): Promise<AppUser | null> {
  if (!hasSupabase()) return null;

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getClaims();
  const sub = auth?.claims?.sub;
  if (!sub) return null;

  const { data: row } = await supabase
    .from("users")
    .select("id, role, school_id, display_name")
    .eq("id", sub)
    .maybeSingle();
  if (!row) return null;

  return {
    id: row.id as string,
    email: (auth.claims.email as string | undefined) ?? null,
    role: row.role as AppRole,
    schoolId: row.school_id as string,
    displayName: row.display_name as string | null,
  };
}

// Gate a Server Component page by exact role. True no-op — returns null
// without redirecting anyone — when Supabase isn't configured, so every
// page using this behaves exactly as it does today until real auth exists.
export async function requireRole(role: AppRole, currentPath: string): Promise<AppUser | null> {
  if (!hasSupabase()) return null;

  const user = await getCurrentAppUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(currentPath)}`);
  if (user.role !== role) redirect("/");
  return user;
}
