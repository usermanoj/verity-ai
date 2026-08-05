// Sections the tutor named, and whether they exist.
//
// Rule 3 of the system prompt tells the model NOT to write a citation: the
// student is reading the deck on the same screen, so a filename and a page
// number is noise. Three of the school's sixty-one replies wrote one anyway.
//
// All three happened to point at real sections — checked by hand, after the
// fact, by someone who went looking. Nothing checks the fourth. A reply that
// says "Page/Section 40" of a thirty-five-section deck tells a child their
// teacher's slide says something it does not, and there is no way for anyone
// to find out.
//
// So the reply is read after it has been sent. Not before: a student must
// never wait on a check, and a citation the model was asked not to write is
// not worth a moment of anybody's lesson. What it buys is that a teacher can
// be told.
//
// Pure, so the rule can be tested without a database and without a model.

/** A source the model named in its own words. */
export type NamedSection = { file: string; page: number };

// "📖 Based on: Magnets and Electromagnets.pptx — Page/Section 32", which is
// the shape the model produces when it ignores rule 3. Deliberately loose
// about the lead-in and strict about the tail: the page number is the part
// that can be wrong in a way that matters.
const NAMED = /Based on:\s*([^\n—]+?)\s*—\s*Page\/Section\s*(\d+)/gi;

/**
 * Every section the reply claims to be based on.
 *
 * Almost always empty, which is the point — it is checked first precisely so
 * that the overwhelmingly common case costs one pass over a string already in
 * memory and nothing else at all.
 */
export function namedSections(text: string): NamedSection[] {
  const out: NamedSection[] = [];
  for (const m of text.matchAll(NAMED)) {
    const page = Number(m[2]);
    if (Number.isFinite(page)) out.push({ file: m[1].trim(), page });
  }
  return out;
}

/** The citation string ingestion writes: "<file> — Page/Section <n>". */
const PAGE_OF = /Page\/Section\s+(\d+)\s*$/;

/**
 * Which of the named sections do not exist in this deck.
 *
 * Takes the corpus's own citation strings rather than chunk ids, because that
 * is the form the page number can be compared against without inventing a
 * second way of parsing one — the mistake that made the first version of this
 * audit report every citation as unresolvable.
 */
export function unknownSections(named: NamedSection[], citations: string[]): NamedSection[] {
  if (named.length === 0) return [];

  const pages = new Set<number>();
  for (const c of citations) {
    const n = Number(PAGE_OF.exec(c)?.[1] ?? NaN);
    if (Number.isFinite(n)) pages.add(n);
  }

  // A deck with no parseable citations at all cannot judge anything, and
  // reporting every section as unknown would be a wall of noise about the
  // corpus rather than about the reply.
  if (pages.size === 0) return [];

  return named.filter((n) => !pages.has(n.page));
}

/**
 * The chunk ids for sections the model named and that really exist.
 *
 * Worth storing: with the whole deck injected into every prompt, "which chunks
 * were available" is a constant and says nothing. "Which section the model
 * said it used" is a claim it made, and recording it turns the next audit into
 * a query instead of a parse.
 */
export function resolveNamed(
  named: NamedSection[],
  chunks: { id: string; source: string }[],
): string[] {
  const byPage = new Map<number, string>();
  for (const c of chunks) {
    const n = Number(PAGE_OF.exec(c.source)?.[1] ?? NaN);
    if (Number.isFinite(n) && !byPage.has(n)) byPage.set(n, c.id);
  }
  return named.map((n) => byPage.get(n.page)).filter((id): id is string => Boolean(id));
}
