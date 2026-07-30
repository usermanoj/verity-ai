import { redirect } from "next/navigation";
import { hasSupabase } from "./supabase/config";
import { supabaseServer } from "./supabase/server";
import { atLeast } from "@/lib/roles";

export type AppRole = "student" | "teacher" | "hod" | "principal";

export type AppUser = {
  id: string;
  email: string | null;
  role: AppRole;
  schoolId: string;
  displayName: string | null;
};

// "Signed out" and "signed in but not provisioned" both produce a null user,
// and collapsing them is what turned a setup mistake into an unexplained
// loop: the callback failed to create the public.users row, every gated page
// bounced to /login, and the login page cheerfully offered to sign in an
// account that was already signed in.
//
// They are different states and the caller has to be able to tell them apart.
type Session =
  | { kind: "anonymous" }
  | { kind: "unprovisioned" } // authenticated with the IdP, but no row here
  | { kind: "user"; user: AppUser };

async function readSession(): Promise<Session> {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getClaims();
  const sub = auth?.claims?.sub;
  if (!sub) return { kind: "anonymous" };

  const { data: row } = await supabase
    .from("users")
    .select("id, role, school_id, display_name")
    .eq("id", sub)
    .maybeSingle();
  if (!row) return { kind: "unprovisioned" };

  return {
    kind: "user",
    user: {
      id: row.id as string,
      email: (auth.claims.email as string | undefined) ?? null,
      role: row.role as AppRole,
      schoolId: row.school_id as string,
      displayName: row.display_name as string | null,
    },
  };
}

// Returns null when Supabase isn't configured (dormant — see hasSupabase())
// or when nobody is usable is signed in. Never throws.
export async function getCurrentAppUser(): Promise<AppUser | null> {
  if (!hasSupabase()) return null;
  const session = await readSession();
  return session.kind === "user" ? session.user : null;
}

// Where to send someone who isn't a usable user yet. An unprovisioned session
// carries a reason so the login page can say what happened rather than
// silently inviting a third identical attempt.
function signInPath(session: Session, currentPath: string): string {
  const next = `next=${encodeURIComponent(currentPath)}`;
  return session.kind === "unprovisioned" ? `/login?error=no_account&${next}` : `/login?${next}`;
}

// Gate a Server Component page by exact role. True no-op — returns null
// without redirecting anyone — when Supabase isn't configured, so every
// page using this behaves exactly as it does today until real auth exists.
// Any signed-in user, whatever their role.
//
// Student-facing pages need a session but not a particular role: a teacher
// previewing a lesson and a student reading it are the same request as far as
// the page is concerned, and only the SCOPE of what they may see differs
// (see lib/access.ts).
//
// Returns null when Supabase isn't configured, matching requireRole — a
// preview build without credentials stays in demo mode rather than redirecting
// every visitor to a login it cannot serve.
export async function requireSignedIn(currentPath: string): Promise<AppUser | null> {
  if (!hasSupabase()) return null;

  const session = await readSession();
  if (session.kind !== "user") redirect(signInPath(session, currentPath));
  return session.user;
}

/**
 * Requires this role OR MORE SENIOR.
 *
 * Renamed from requireRole, and the rename is the point: the old name read as
 * an equality test and was one, so a principal was turned away from a teacher's
 * page for not being a teacher. That made the bootstrap principal a trap — the
 * one person who has to set the system up was locked out of most of it the
 * moment they became senior enough to manage it.
 *
 * The name now says what it does, so nobody reads a call site as "only".
 */
export async function requireAtLeast(role: AppRole, currentPath: string): Promise<AppUser | null> {
  if (!hasSupabase()) return null;

  const session = await readSession();
  if (session.kind !== "user") redirect(signInPath(session, currentPath));
  if (!atLeast(session.user.role, role)) redirect("/");
  return session.user;
}
