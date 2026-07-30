import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/supabase/config";
import { reportError } from "./report";

export type RecordedError = {
  fingerprint: string;
  day: string;
  area: string;
  message: string;
  detail: string | null;
  count: number;
  firstSeen: string;
  lastSeen: string;
};

/**
 * Recorded failures, most frequent first, over the last `days` days.
 *
 * Read through the RLS-scoped client, so the policy in 0033 decides who sees
 * this rather than a check here that could be forgotten.
 */
export async function getRecordedErrors(days = 7): Promise<RecordedError[]> {
  if (!hasSupabase()) return [];

  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("app_errors")
      .select("fingerprint, day, area, message, detail, count, first_seen, last_seen")
      .gte("day", since)
      .order("count", { ascending: false })
      .limit(50);
    if (error) throw error;

    return (data ?? []).map((r) => ({
      fingerprint: r.fingerprint,
      day: r.day,
      area: r.area,
      message: r.message,
      detail: r.detail,
      count: r.count,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
    }));
  } catch (err) {
    // The error page failing to load is itself worth recording, and the console
    // half of reportError works even when the database is the problem.
    await reportError("analytics", err, "could not read the error log");
    return [];
  }
}
