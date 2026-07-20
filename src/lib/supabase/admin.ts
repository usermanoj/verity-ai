import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";
import type { Database } from "./types";

// Service-role client — bypasses RLS. Server-only, and only for the one
// thing that genuinely needs to bypass RLS: provisioning a brand-new
// public.users row on first sign-in (a user with no row yet can't satisfy
// any RLS policy that reads their own row). Never import this from a
// Client Component or expose SUPABASE_SERVICE_ROLE_KEY to the browser.
export const hasSupabaseAdmin = () => Boolean(SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

let client: ReturnType<typeof createClient<Database>> | null = null;

export function supabaseAdmin() {
  if (!hasSupabaseAdmin()) {
    throw new Error("Supabase admin is not configured — check hasSupabaseAdmin() before calling supabaseAdmin().");
  }
  if (!client) {
    client = createClient<Database>(SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
