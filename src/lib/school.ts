// Which school a newly signed-in user belongs to.
//
// This existed inline in the auth callback as `process.env.DEFAULT_SCHOOL_ID`,
// guarding provisioning with `if (hasAdmin && defaultSchoolId)`. That variable
// is commented out in .env.local.example, so a setup following the example
// verbatim silently skipped provisioning: the user authenticated with Google,
// got no public.users row, and every gated page bounced them back to the
// login screen forever.
//
// It lives here so the rule is testable on its own.

// The minimum surface needed from the service-role client — narrow enough
// that a test can hand it a fake without constructing a Supabase client.
export type SchoolReader = {
  from(table: "schools"): {
    select(columns: "id"): {
      limit(n: number): PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>;
    };
  };
};

/**
 * Returns the configured school, or the only one that exists.
 *
 * A single-school deployment does not need to be told which school it is —
 * with exactly one row there is nothing to disambiguate. Two or more is a
 * real ambiguity and must be configured: guessing would file a student into
 * another school's data, which is the one mistake here that isn't recoverable
 * by trying again.
 *
 * Returns null when the answer would be a guess, so the caller can say so
 * rather than fall through to a redirect that looks like nothing happened.
 */
export async function resolveSchoolId(
  admin: SchoolReader,
  configured = process.env.DEFAULT_SCHOOL_ID,
): Promise<string | null> {
  const explicit = configured?.trim();
  if (explicit) return explicit;

  // limit(2) is all it takes to distinguish "exactly one" from "more than one".
  const { data, error } = await admin.from("schools").select("id").limit(2);
  if (error) {
    console.error("[school] could not read schools", error);
    return null;
  }
  if (data?.length === 1) return data[0].id;

  console.error(
    `[school] DEFAULT_SCHOOL_ID is unset and ${data?.length ?? 0} schools exist — cannot resolve`,
  );
  return null;
}
