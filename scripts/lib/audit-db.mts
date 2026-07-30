import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The plumbing every audit needs, with the one thing they all kept missing.
//
// Every ad-hoc audit written during this project used supabase-js directly and
// destructured `{ data }`, discarding `error`. That reads as zero rows. Three
// separate times it produced a confident wrong answer:
//
//   · "no student account to test with"   — users has no `email` column
//   · "conversations opened: undefined"   — conversations has no `created_at`
//   · an empty analytics list             — the RPC did not exist yet
//
// Each looked exactly like a true negative. This is the same failure the
// application had in eight places and had fixed by reportError — the tooling
// used to FIND those bugs never got the same treatment, which is why the fix
// belongs here rather than in anyone's memory.

type Postgrestish<T> = { data: T | null; error: { message: string; code?: string } | null };

/**
 * Unwraps a Supabase result, or throws with the query's name.
 *
 * Throws on a null payload as well as on an error. A list select returns `[]`
 * when it finds nothing, so `null` without an error means something structural
 * — a table or column that does not exist — and that is precisely the case that
 * otherwise reads as "no rows".
 */
export function must<T>(result: Postgrestish<T>, what: string): T {
  if (result.error) {
    throw new Error(`${what} failed: ${result.error.message}${result.error.code ? ` [${result.error.code}]` : ""}`);
  }
  if (result.data === null) {
    throw new Error(`${what} returned no data and no error — does that table or column exist?`);
  }
  return result.data;
}

/**
 * For lookups where "not found" is a real answer, such as maybeSingle().
 *
 * Still throws on error. The distinction is between an absent ROW, which is
 * information, and an absent QUERY, which is a bug.
 */
export function optional<T>(result: Postgrestish<T>, what: string): T | null {
  if (result.error) {
    throw new Error(`${what} failed: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Parses a .env file's assignments.
 *
 * Kept pure and tested because getting it subtly wrong is silent: a value that
 * keeps its quotes still looks like a value, and the audit then runs against
 * nothing while reporting an empty database.
 */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key) out[key] = value;
  }
  return out;
}

const REQUIRED = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export function loadEnv(file = ".env.local"): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`Could not read ${file}. Run this from the project root.`);
  }
  const env = parseEnv(text);
  // Named individually rather than "config missing": which one is missing is
  // the whole of the fix.
  const absent = REQUIRED.filter((k) => !env[k]);
  if (absent.length) throw new Error(`${file} is missing: ${absent.join(", ")}`);
  return env;
}

/** Service-role client. Bypasses RLS — for reading facts, not for judging access. */
export function adminClient(env = loadEnv()): SupabaseClient {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * A client acting as a real person, for checking what a PAGE would show.
 *
 * The service role has no auth.uid(), so every role-gated function returns
 * empty to it — which looks identical to a function that is broken. This is the
 * only way to tell those apart, and it is why an audit that only uses the admin
 * client can confirm a table exists and prove nothing about whether anyone can
 * read it.
 *
 * Costs a sign-in record on that account. Read-only otherwise.
 */
export async function asUser(email: string, env = loadEnv()): Promise<SupabaseClient> {
  const admin = adminClient(env);
  // Not must(): the auth API returns a different shape from PostgREST — on
  // failure `data` is an object of nulls rather than null itself, so the guard
  // that catches a missing table would pass straight through here.
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(`generateLink(${email}) failed: ${link.error.message}`);

  const token = link.data?.properties?.hashed_token;
  if (!token) throw new Error(`No sign-in token for ${email} — is that address a real account?`);

  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { error } = await client.auth.verifyOtp({ token_hash: token, type: "magiclink" });
  if (error) throw new Error(`Could not act as ${email}: ${error.message}`);
  return client;
}

/** Aligns a table of rows without a dependency. */
export function table(rows: string[][]): string {
  if (rows.length === 0) return "";
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length)));
  return rows.map((r) => r.map((cell, i) => (cell ?? "").padEnd(widths[i])).join("  ").trimEnd()).join("\n");
}
