import { getCurrentAppUser } from "@/lib/auth";
import { hasSupabase } from "@/lib/supabase/config";
import { supabaseServer } from "@/lib/supabase/server";

// Fire-and-forget event logging — never throws, never blocks the caller.
// True no-op until Supabase is configured AND a real user is signed in.
// Student-facing pages (/subjects, /topics/*) aren't auth-gated yet (see
// ROADMAP.md §7), so in the current deployment this never actually fires —
// it's here so usage events start flowing the moment student auth exists,
// with no further code changes needed.
export async function logEvent(type: string, payload: Record<string, unknown> = {}): Promise<void> {
  if (!hasSupabase()) return;
  try {
    const user = await getCurrentAppUser();
    if (!user) return;
    const supabase = await supabaseServer();
    await supabase.from("events").insert({ user_id: user.id, type, payload });
  } catch {
    // Logging must never affect the caller's actual response.
  }
}
