// Finding glossary terms inside lesson prose.
//
// This was inline in ReadingText, which made it untestable — and it has
// already carried two silent faults: an ordering bug where "magnetic" ahead of
// "magnetic field" meant the phrase could never match, and an empty-list bug
// where the built pattern was /\b()\b/, which matches at every position and
// shatters a paragraph into one span per character.
//
// Both were invisible in the product: a glossary that highlights the wrong
// thing, or nothing, looks exactly like a document with no hard words in it.

export type Glossary = Record<string, { en: string; zh: string }>;

export type Piece =
  | { kind: "text"; text: string }
  | { kind: "term"; text: string; en: string; zh: string };

// Terms come from a model and end up in a regex, so anything with special
// meaning has to be neutralised — a stray "(" would throw at render time and
// blank the whole lesson.
function escapeForRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits `text` into plain runs and glossary matches.
 *
 * Matching is case-insensitive; the returned gloss is looked up by the term's
 * lower-cased form, which is how the terms are stored.
 */
export function splitByGlossary(text: string, glossary: Glossary): Piece[] {
  const terms = Object.keys(glossary).filter((t) => t.trim().length > 0);
  if (terms.length === 0) return [{ kind: "text", text }];

  // Longest first: regex alternation takes the first branch that matches at a
  // position, so "magnetic" ahead of "magnetic field" would win and leave
  // "field" bare. Same for "pole" shadowing "north pole".
  const ordered = [...terms].sort((a, b) => b.length - a.length).map(escapeForRegex);

  // \b fails against a term that starts or ends with a non-word character
  // (an ideograph, a leading hyphen), so the boundary is asserted with
  // lookaround on word characters instead.
  const pattern = new RegExp(`(?<![A-Za-z0-9])(${ordered.join("|")})(?![A-Za-z0-9])`, "gi");

  const pieces: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) pieces.push({ kind: "text", text: text.slice(last, start) });
    const matched = match[0];
    const entry = glossary[matched.toLowerCase()];
    if (entry) {
      pieces.push({ kind: "term", text: matched, en: entry.en, zh: entry.zh });
    } else {
      // Matched the pattern but not the map — a term stored with different
      // casing than its key. Show the word rather than dropping it.
      pieces.push({ kind: "text", text: matched });
    }
    last = start + matched.length;
  }
  if (last < text.length) pieces.push({ kind: "text", text: text.slice(last) });

  return pieces;
}
