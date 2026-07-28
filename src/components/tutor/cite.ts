// Parsing for the "📖 Based on: <file> — Page/Section <n>" line.
//
// The tutor prompt no longer asks for one, so live replies don't carry it.
// This still exists for two reasons: the offline/demo fallback replies do
// emit it, and anything the model volunteers out of habit has to be stripped
// from the body rather than shown to the student.
//
// Why the line went away, having once been the headline feature: printed in
// full it was the deck's filename repeated once per section — nine lines of
// it under a four-line answer. Compacting it to "§1 §4 §8" chips helped the
// clutter, but generating the line at all costs ~80 output tokens on a
// 55-word reply, which is real latency in the one place a student is waiting.
// The closed corpus is enforced by construction — only approved material is
// ever in context — so the guarantee holds without the model narrating it.
//
// Putting the visible chips back is a small change if a school demo wants
// them on screen.

export type ParsedCite = { file: string | null; sections: number[] };

// Citations arrive as "<file> — Page/Section <n>", comma-joined. Scanning for
// the section numbers is safer than splitting on ", " — filenames contain
// commas often enough ("Unit 7, Magnets.pptx") to make that a real bug.
const SECTION_RE = /Page\/Section\s+(\d+)/g;

export function parseCite(cite: string): ParsedCite {
  const body = cite.replace(/^📖\s*Based on:\s*/, "").trim();

  const sections = [...body.matchAll(SECTION_RE)].map((m) => Number(m[1]));
  const unique = [...new Set(sections)].sort((a, b) => a - b);

  // Everything before the first em-dash of the first citation — the same file
  // for every entry in practice, since a reply draws on one document.
  const file = body.split(" — ")[0]?.replace(/\s*\(demo mode.*\)\s*$/, "").trim() || null;

  return { file: file && file !== body ? file : null, sections: unique };
}

// One short line, for the "Checking against" hint above the answer box — the
// only place provenance is still shown, because there it says something
// actionable: this is the passage your attempt is being marked against.
export function shortCite(cite: string): string {
  const { file, sections } = parseCite(cite);
  if (sections.length === 0) return file ?? cite.replace(/^📖\s*Based on:\s*/, "");
  return sections.length === 1 ? `Section ${sections[0]}` : `Sections ${sections.join(", ")}`;
}
