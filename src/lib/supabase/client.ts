import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabase } from "./config";
import type { Database } from "./types";

// Callers must check hasSupabase() first — this throws rather than silently
// returning a broken client, since a Client Component that reaches this
// point without checking has a real bug, not a "not configured yet" state.
//
// NOTE: ./types.ts is a minimal hand-written subset (just public.users).
// Once a real Supabase project exists, run
// `npx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts`
// to replace it with the full generated schema.
let client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function supabaseBrowser() {
  if (!hasSupabase()) {
    throw new Error("Supabase is not configured — check hasSupabase() before calling supabaseBrowser().");
  }
  if (!client) {
    client = createBrowserClient<Database>(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  }
  return client;
}
