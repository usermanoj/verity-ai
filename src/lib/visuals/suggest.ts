// Proposing an interactive for a section that matching left bare.
//
// Matching is a regex over the heading and the text, and it is deliberately
// narrow: a section that does not clearly match gets nothing, because a wrong
// diagram teaches a wrong thing. On this school's three decks that leaves most
// sections with no interactive at all, and the picker (see VisualPicker) fixed
// that by letting a teacher choose — which works, and asks them to read 32
// sections and remember what eight visuals do.
//
// So the model does the reading and the teacher does the deciding. That split
// is the whole design, and it is why nothing here writes to section_visuals: a
// suggestion is a separate row in a separate table that no student can read.
// Until a teacher accepts it, it has changed no lesson.
//
// Everything in this file is pure. The model's output is untrusted input —
// treated the same way a form post would be — and the filtering below is what
// turns it into something that can be shown to a teacher.

import type { Resolved } from "./resolve";

/** A section the model is allowed to propose something for. */
export type SectionForSuggestion = { chunkId: string; heading: string; text: string };

/** What the model returns, before any of it has been checked. */
export type RawSuggestion = { chunkId?: unknown; visual?: unknown; reason?: unknown };

export type Suggestion = { chunkId: string; visual: string; reason: string };

/**
 * The sections worth asking about.
 *
 * Two exclusions, and the second is the one that matters. A section matching
 * already illustrated does not need a second opinion. A section the TEACHER
 * turned off must never be proposed again — they looked at it and said no, and
 * an assistant that re-offers a rejected suggestion every time the page loads
 * is not assisting.
 */
export function sectionsNeedingSuggestion(
  sections: SectionForSuggestion[],
  resolved: Resolved[],
): SectionForSuggestion[] {
  return sections.filter((_, i) => {
    const r = resolved[i];
    return r !== undefined && r.visual === null && r.source === "automatic";
  });
}

/**
 * Turns the model's answer into suggestions worth showing, or into nothing.
 *
 * Five things are dropped, in this order:
 *
 *   · a visual this codebase does not ship — the model inventing an id
 *   · a section that was not on the list — including one already illustrated
 *   · a visual already on screen elsewhere in this lesson
 *   · a second suggestion for a section already suggested for
 *   · a suggestion with no reason
 *
 * The last is not tidiness. The teacher is being asked to approve something,
 * and "this section is about balancing a beam" is the entire basis on which
 * they can say yes without opening the deck. A suggestion that cannot say why
 * is a guess wearing a recommendation's clothes.
 *
 * Dropping rather than repairing throughout: a malformed suggestion is a
 * suggestion the model was not confident about, and there is no shortage of
 * sections.
 */
export function keepValidSuggestions(
  raw: RawSuggestion[],
  eligible: SectionForSuggestion[],
  known: readonly string[],
  alreadyShowing: readonly string[] = [],
): Suggestion[] {
  const ids = new Set(eligible.map((s) => s.chunkId));
  const taken = new Set<string>(alreadyShowing);
  const suggested = new Set<string>();
  const out: Suggestion[] = [];

  for (const item of raw) {
    const chunkId = typeof item.chunkId === "string" ? item.chunkId : "";
    const visual = typeof item.visual === "string" ? item.visual : "";
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";

    if (!known.includes(visual)) continue;
    if (!ids.has(chunkId)) continue;
    if (taken.has(visual)) continue;
    if (suggested.has(chunkId)) continue;
    if (!reason) continue;

    taken.add(visual);
    suggested.add(chunkId);
    out.push({ chunkId, visual, reason });
  }

  return out;
}

/**
 * The catalogue, written for the model rather than for the teacher.
 *
 * Same ids the picker offers, so anything proposed can be accepted with one
 * click and nothing has to be translated in between.
 */
export function catalogueForPrompt(visuals: { id: string; label: string; blurb: string }[]): string {
  return visuals.map((v) => `  ${v.id} — ${v.label}: ${v.blurb}`).join("\n");
}

/**
 * The sections, numbered by id so the model answers with something that can be
 * looked up rather than with a position that can drift.
 *
 * Truncated per section: the decision is "what is this section about", which
 * the first couple of hundred words settle. A 32-section deck sent whole is
 * mostly tokens spent re-reading worked examples.
 */
export function sectionsForPrompt(sections: SectionForSuggestion[], perSection = 600): string {
  return sections
    .map((s) => {
      const text = s.text.length > perSection ? `${s.text.slice(0, perSection)}…` : s.text;
      return `[${s.chunkId}] ${s.heading || "(no heading)"}\n${text}`;
    })
    .join("\n\n");
}

export const SUGGEST_SYSTEM_PROMPT = [
  "You choose interactive illustrations for sections of a science lesson. The lesson is real material a teacher uploaded and approved, and the students reading it are learning in a second language.",
  "",
  "You are choosing from a FIXED list of interactives that already exist. You cannot invent one, describe one, or ask for one to be built. If nothing in the list fits a section, that section gets nothing — which is the correct and expected answer for most sections.",
  "",
  "THE HONESTY RULE, which outranks everything else:",
  "An interactive may only animate something the section ALREADY SAYS. It must not introduce a fact, a number, a relationship or an example the teacher did not write. If a section mentions magnets but never discusses the field around one, the field visual does not belong there — a student would take it as part of the lesson, and it is not.",
  "",
  "Choose FEWER rather than more. A lesson with three well-placed interactives reads as authored; one with fifteen reads as automated, and a teacher who has to reject twelve suggestions will stop reading them. Propose at most one interactive per section, and never the same interactive twice in one lesson.",
  "",
  "For each suggestion give a REASON in one short sentence, addressed to the teacher, saying what in the section the interactive illustrates. Quote or name the specific idea. \"This section defines the moment of a force as force times distance\" is a reason; \"this section is about physics\" is not, and a suggestion you cannot justify that concretely should not be made.",
  "",
  "Return an empty list if nothing fits. That is a good answer, not a failure.",
].join("\n");
