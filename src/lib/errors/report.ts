import { supabaseAdmin, hasSupabaseAdmin } from "@/lib/supabase/admin";
import { briefStack, fingerprintFor, sanitise } from "./fingerprint";

// One place to report a failure that the caller is going to swallow.
//
// `catch {}` is often the right call — a logging write must not break a lesson,
// one unrenderable page must not fail an upload. What it must never also mean is
// that nobody finds out. This is the difference between "the caller is not
// disturbed" and "the failure did not happen".

/** Coarse enough that a person can act on it, not a file path. */
export type ErrorArea =
  | "tutor"
  | "translate"
  | "ai-usage"
  | "ingest"
  | "questions"
  | "analytics"
  | "conversations"
  | "events"
  | "language"
  | "auth";

/**
 * Records a failure without ever becoming one.
 *
 * Always writes to the console first, so the report survives even when the
 * database is the thing that is broken — which is the case where a
 * database-backed error log is least able to help and most needed.
 *
 * Never throws and never awaits anything the caller depends on. Safe to call
 * from inside a catch block, which is the only place it is meant to be called
 * from.
 *
 * Do not pass student work. Messages are redacted and truncated (see
 * fingerprint.ts) but redaction is a safety net, not a licence: a child's answer
 * has no business in an operations log that staff across the school can read.
 */
export async function reportError(area: ErrorArea, err: unknown, note?: string): Promise<void> {
  const raw = err instanceof Error ? err.message : String(err);
  const message = sanitise(note ? `${note}: ${raw}` : raw);
  const detail = err instanceof Error ? briefStack(err.stack) : null;

  // First and unconditionally. Vercel captures stdout, so this is the report
  // that cannot itself fail.
  console.error(`[${area}] ${message}${detail ? `\n${detail}` : ""}`);

  if (!hasSupabaseAdmin()) return;

  try {
    await supabaseAdmin().rpc("record_error", {
      p_fingerprint: fingerprintFor(area, message),
      p_area: area,
      p_message: message,
      p_detail: detail,
    });
  } catch (reportingFailure) {
    // The one catch in the codebase that genuinely has nowhere to go. Reported
    // to the console rather than swallowed, because "the error log is broken"
    // is itself a thing worth knowing, and recursing into reportError here
    // would be a loop.
    console.error(`[report-error] could not record a ${area} failure:`, reportingFailure);
  }
}
