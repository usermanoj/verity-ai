// The first principal, without a database prompt.
//
// A school's staff list can only be managed by staff, so a brand-new deployment
// has nobody to start the chain — until now that was solved by inserting a row
// by hand in the SQL editor, which meant every new school needed someone with
// database credentials. This is the loop-breaker.
//
// An environment variable rather than "whoever signs in first becomes
// principal": that version is a race anyone who finds the URL can win, and the
// prize is every child's transcript. This is explicit, auditable in the Vercel
// dashboard, and revoked by editing one value.

/**
 * Addresses that receive `principal` on sign-in, from BOOTSTRAP_PRINCIPAL_EMAILS.
 *
 * Comma-separated. Parsed rather than read raw so that whitespace, casing and a
 * trailing comma — the three things a person typing into a dashboard field
 * actually does — cannot silently produce a list that matches nobody.
 */
export function bootstrapPrincipals(raw: string | undefined = readEnv()): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      // Quotes stripped as well as whitespace. A value pasted as
      // "head@school.edu" keeps its quotes, still contains an @, and so passes
      // every check while matching nobody — a silent no-match that looks
      // exactly like the feature not working.
      .map((e) => e.trim().replace(/^["']|["']$/g, "").trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
}

// Bracket notation, deliberately.
//
// Next.js statically replaces `process.env.SOMETHING` at build time where it
// can, so a variable added to the dashboard AFTER the last build can be inlined
// as undefined and stay undefined however many times the page is reloaded. A
// dynamic key cannot be inlined, so this is always read at runtime — which is
// the only correct time to read a value someone edits in a dashboard.
function readEnv(): string | undefined {
  return process.env["BOOTSTRAP_PRINCIPAL_EMAILS"];
}

/**
 * How the variable is configured, for diagnosis.
 *
 * This failing is silent by nature: nothing is thrown, nobody is granted
 * anything, and the symptom is a person who signs in and is still a teacher.
 * Reported at sign-in so the answer is a line in the health log rather than an
 * afternoon of guessing which of four things went wrong.
 */
export const NOT_SET = "BOOTSTRAP_PRINCIPAL_EMAILS is not set for this deployment";
export const SET_BUT_EMPTY = "BOOTSTRAP_PRINCIPAL_EMAILS is set but contains no usable address";

export function bootstrapConfigNote(raw: string | undefined = readEnv()): string | null {
  if (raw === undefined) return NOT_SET;
  return bootstrapPrincipals(raw).size === 0 ? SET_BUT_EMPTY : null;
}

/** How many addresses the variable names. Never the addresses themselves. */
export function bootstrapCount(raw: string | undefined = readEnv()): number {
  return bootstrapPrincipals(raw).size;
}

/** Whether this address is a bootstrap principal. */
export function isBootstrapPrincipal(email: string | null, raw?: string): boolean {
  if (!email) return false;
  return bootstrapPrincipals(raw).has(email.toLowerCase());
}
