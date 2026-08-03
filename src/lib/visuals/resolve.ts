// Which visual a section actually shows, once a teacher has had their say.
//
// Three states, and the difference between two of them is the whole feature:
//
//   no row          use whatever matching decides
//   row, visual set show this one, whatever matching thinks
//   row, visual null show NOTHING here — I looked, and none of them fit
//
// Collapsing the last two into "null means automatic" would make "hide it"
// impossible to express, and hiding is the correction a teacher most often
// wants: the regex is conservative but not infallible, and a diagram of the
// wrong thing is the failure worth being able to undo in one click.

/** What the teacher has recorded for a chunk, if anything. */
export type VisualOverride = { chunkId: string; visual: string | null };

export type Resolved = {
  /** The visual to render, or null for none. */
  visual: string | null;
  /** How that was decided — for the teacher's screen, not the student's. */
  source: "automatic" | "chosen" | "hidden";
};

/**
 * Applies overrides on top of the automatic assignment.
 *
 * Takes both as parallel arrays keyed by chunk id, and returns one decision per
 * section in the same order. Pure, so the resolution can be tested without a
 * database and without rendering anything.
 *
 * An override naming a visual that no longer exists resolves to nothing rather
 * than throwing: visuals are code and a teacher's choice outlives a refactor,
 * so a removed one must degrade to a missing picture, not a broken lesson.
 */
export function resolveVisuals(
  chunkIds: string[],
  automatic: (string | null)[],
  overrides: VisualOverride[],
  known: readonly string[],
): Resolved[] {
  const byChunk = new Map(overrides.map((o) => [o.chunkId, o]));

  return chunkIds.map((id, i) => {
    const override = byChunk.get(id);
    if (!override) {
      return { visual: automatic[i] ?? null, source: "automatic" };
    }
    if (override.visual === null) {
      return { visual: null, source: "hidden" };
    }
    // A chosen visual that the code no longer ships.
    if (!known.includes(override.visual)) {
      return { visual: null, source: "hidden" };
    }
    return { visual: override.visual, source: "chosen" };
  });
}

/**
 * Stops the same visual appearing twice in one lesson.
 *
 * assignVisuals already does this for automatic matches — a concept earns its
 * interactive once, because five identical coil widgets read as automation
 * rather than authorship. An override can reintroduce the duplicate, so the
 * rule is applied again after resolution.
 *
 * A teacher's explicit choice always wins over an automatic one: if they put
 * the lever on section 3 and matching also wanted it on section 1, section 3
 * keeps it. They looked at the lesson; the regex looked at a string.
 */
export function dedupe(resolved: Resolved[]): Resolved[] {
  const out: Resolved[] = resolved.map((r) => ({ ...r }));
  const claimed = new Set<string>();

  // Chosen first, so an explicit decision takes the visual before an automatic
  // match can claim it.
  for (const pass of ["chosen", "automatic"] as const) {
    out.forEach((r) => {
      if (r.source !== pass || !r.visual) return;
      if (claimed.has(r.visual)) {
        r.visual = null;
        // Still "chosen" — the teacher did choose; it simply lost to another
        // section of theirs, and the interface can say so.
        return;
      }
      claimed.add(r.visual);
    });
  }
  return out;
}
