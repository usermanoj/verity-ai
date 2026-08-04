// "Closer the poles, greater is the force" — made draggable.
//
// A syllabus states proportionality in words long before it states it in
// symbols, and this sentence shape is how: a comparative on each side of a
// comma. It is also, in this school's corpus, more common than a written
// formula. So it gets the same treatment the formula playground gets, and for
// the same reason — nothing here knows any subject. It works on
//
//   Closer the poles, greater is the force
//   Greater the distance from the wire, weaker is the magnetic field
//   Higher the temperature, faster the reaction
//   Larger the surface area, quicker the dissolving
//
// none of which is written down anywhere in this codebase.
//
// WHAT IT MUST NOT DO. The source states the relationship QUALITATIVELY. It
// says force grows as separation shrinks; it does not say by how much, and it
// certainly does not say inverse-square. So there are no numbers, no axes and
// no curve — a bar that moves in the stated direction, and the teacher's own
// sentence above it. The existing DistanceForce visual settled this argument
// already and its reasoning is quoted in its own comment; this generalises it.

/** Which way a comparative points. */
export type Direction = "up" | "down";

/**
 * Every comparative the detector recognises, and its opposite.
 *
 * Dictionary antonyms, not claims about any subject: "closer" is the opposite
 * of "further" in English, whatever is being measured. Naming both ends lets a
 * student see the relationship from either side, which is the half of it a
 * static card cannot show.
 */
export const COMPARATIVES: Record<string, { direction: Direction; opposite: string }> = {
  greater: { direction: "up", opposite: "smaller" },
  larger: { direction: "up", opposite: "smaller" },
  bigger: { direction: "up", opposite: "smaller" },
  higher: { direction: "up", opposite: "lower" },
  stronger: { direction: "up", opposite: "weaker" },
  faster: { direction: "up", opposite: "slower" },
  quicker: { direction: "up", opposite: "slower" },
  more: { direction: "up", opposite: "less" },
  further: { direction: "up", opposite: "closer" },
  farther: { direction: "up", opposite: "closer" },
  longer: { direction: "up", opposite: "shorter" },
  taller: { direction: "up", opposite: "shorter" },
  heavier: { direction: "up", opposite: "lighter" },
  hotter: { direction: "up", opposite: "colder" },
  warmer: { direction: "up", opposite: "cooler" },
  brighter: { direction: "up", opposite: "dimmer" },
  wider: { direction: "up", opposite: "narrower" },
  thicker: { direction: "up", opposite: "thinner" },
  deeper: { direction: "up", opposite: "shallower" },
  steeper: { direction: "up", opposite: "gentler" },
  smaller: { direction: "down", opposite: "larger" },
  lower: { direction: "down", opposite: "higher" },
  weaker: { direction: "down", opposite: "stronger" },
  slower: { direction: "down", opposite: "faster" },
  less: { direction: "down", opposite: "more" },
  closer: { direction: "down", opposite: "further" },
  nearer: { direction: "down", opposite: "further" },
  shorter: { direction: "down", opposite: "longer" },
  lighter: { direction: "down", opposite: "heavier" },
  colder: { direction: "down", opposite: "hotter" },
  cooler: { direction: "down", opposite: "warmer" },
  dimmer: { direction: "down", opposite: "brighter" },
  narrower: { direction: "down", opposite: "wider" },
  thinner: { direction: "down", opposite: "thicker" },
  shallower: { direction: "down", opposite: "deeper" },
  gentler: { direction: "down", opposite: "steeper" },
};

/**
 * The same words, for the detector's pattern.
 *
 * One list, not two. structure.ts used to carry its own alternation of
 * comparatives and this file its own table of them, which is the shape of
 * every drift bug in this codebase: a rule expressed twice, and the copy
 * nobody reads going stale. Adding "quicker" is now one line, and a word the
 * detector can find is by construction a word this file can point.
 *
 * Longest first, so the alternation cannot match "less" inside "lesser".
 */
export const COMPARATIVE_WORDS: string[] = Object.keys(COMPARATIVES).sort(
  (a, b) => b.length - a.length,
);

export type Playable = {
  /** The comparative as the teacher wrote it, and its opposite. */
  cause: { word: string; opposite: string; thing: string; direction: Direction };
  effect: { word: string; opposite: string; thing: string; direction: Direction };
  /**
   * True when the two comparatives point opposite ways — closer/greater,
   * further/weaker. The quantity and its effect move against each other.
   */
  inverse: boolean;
};

/**
 * Turns a detected relationship into something with a direction.
 *
 * Returns null for a comparative not in the table above, rather than guessing
 * which way an unknown word points. Guessing would put an arrow on a teacher's
 * lesson pointing the wrong way, which teaches the opposite of the sentence
 * printed directly above it.
 */
export function toPlayable(parts: {
  causeWord: string;
  causeThing: string;
  effectWord: string;
  effectThing: string;
}): Playable | null {
  const cause = COMPARATIVES[parts.causeWord.toLowerCase()];
  const effect = COMPARATIVES[parts.effectWord.toLowerCase()];
  if (!cause || !effect) return null;
  if (!parts.causeThing.trim() || !parts.effectThing.trim()) return null;

  return {
    cause: {
      word: parts.causeWord.toLowerCase(),
      opposite: cause.opposite,
      thing: clean(parts.causeThing),
      direction: cause.direction,
    },
    effect: {
      word: parts.effectWord.toLowerCase(),
      opposite: effect.opposite,
      thing: clean(parts.effectThing),
      direction: effect.direction,
    },
    inverse: cause.direction !== effect.direction,
  };
}

/**
 * Where the effect sits, given where the cause is.
 *
 * Both on 0..1, and the only arithmetic in the file. A direct relationship
 * tracks; an inverse one mirrors. Nothing steeper or shallower than a straight
 * line, because the source says which way and never how fast.
 */
export function effectAt(play: Playable, cause: number): number {
  const clamped = Math.min(1, Math.max(0, cause));
  return play.inverse ? 1 - clamped : clamped;
}

/**
 * The relationship in words, at whichever end the student is looking.
 *
 * At one end this is the teacher's own sentence; at the other it is its
 * converse, which is the same statement read backwards and is what a student
 * is usually asked to produce. Both halves flip together, so the pair is never
 * a claim the sentence does not support.
 */
export function readingAt(play: Playable, cause: number): string {
  const high = cause >= 0.5;
  const causeWord = high ? highWord(play.cause) : lowWord(play.cause);
  const effectSide = play.inverse ? !high : high;
  const effectWord = effectSide ? highWord(play.effect) : lowWord(play.effect);
  return `${sentenceCase(causeWord)} ${play.cause.thing} → ${effectWord} ${play.effect.thing}`;
}

/** The word for this quantity's upper end, whichever way the teacher wrote it. */
function highWord(side: { word: string; opposite: string; direction: Direction }): string {
  return side.direction === "up" ? side.word : side.opposite;
}

function lowWord(side: { word: string; opposite: string; direction: Direction }): string {
  return side.direction === "up" ? side.opposite : side.word;
}

/** Trailing filler the sentence pattern leaves behind — "is the", "are". */
function clean(thing: string): string {
  return thing
    .replace(/\s+/g, " ")
    .replace(/^(?:is|are)\s+(?:the\s+)?/i, "")
    .replace(/[.,;:]+$/, "")
    .trim();
}

function sentenceCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
