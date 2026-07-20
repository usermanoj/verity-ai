import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabase } from "./config";
import type { Database } from "./types";

// For Server Components and Route Handlers. Callers must check hasSupabase()
// first (see client.ts for why this throws instead of no-op-ing).
//
// Always create a new client per request — never module-cache this one
// (unlike supabaseBrowser()), per Supabase's own SSR guidance: sharing a
// server client across requests leaks one user's session into another's.
export async function supabaseServer() {
  if (!hasSupabase()) {
    throw new Error("Supabase is not configured — check hasSupabase() before calling supabaseServer().");
  }
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render, where cookies can't be
          // written. Harmless as long as proxy.ts is also refreshing the
          // session (added in the auth task) — see @supabase/ssr's own
          // warning about this exact case.
        }
      },
    },
  });
}
