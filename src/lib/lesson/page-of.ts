/**
 * The page or slide a chunk came from.
 *
 * It exists only inside the citation string ("Moments.pptx — Page/Section 7"),
 * which is both how a lesson is put back into reading order and how media and
 * tables are keyed to their section.
 *
 * Its own module because those two callers cannot share one: the ordering is
 * done in content-repo.ts, which imports the service-role client, and the
 * keying is done in a client component. There were briefly two copies with
 * different fallbacks, which is the bug this file exists to prevent.
 *
 * Anything unparseable sorts LAST rather than first, so a malformed citation
 * can never displace the opening section of a lesson. The same value keys no
 * media, which is the right answer for the other caller.
 */
export function pageOf(citation: string): number {
  const match = /Page\/Section\s+(\d+)\s*$/.exec(citation);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}
