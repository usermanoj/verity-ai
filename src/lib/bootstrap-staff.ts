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
export function bootstrapPrincipals(raw: string | undefined = process.env.BOOTSTRAP_PRINCIPAL_EMAILS): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@")),
  );
}

/** Whether this address is a bootstrap principal. */
export function isBootstrapPrincipal(email: string | null, raw?: string): boolean {
  if (!email) return false;
  return bootstrapPrincipals(raw).has(email.toLowerCase());
}
