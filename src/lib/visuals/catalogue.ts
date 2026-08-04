// The catalogue of interactive illustrations, and the rules that match them
// to a section of approved material.
//
// Plain TypeScript, deliberately: this is imported by the API routes and by
// the suggestion pass as well as by the components. It used to live inside
// ConceptVisual.tsx, which carries a "use client" directive and pulls in
// framer-motion, three.js and every widget — so a route that only wanted to
// know whether "lever" is a real id was importing a 3D renderer to find out.
//
// Nothing here renders anything. ConceptVisual.tsx re-exports it all, so the
// components that were importing from there still can.

export type VisualKind =
  | "domains"
  | "field"
  | "broken"
  | "distance"
  | "electromagnet"
  | "conductor"
  | "grip"
  | "lever"
  | "gradient"
  | "journey";

/**
 * Every visual, named for a teacher rather than for the code.
 *
 * The picker shows these. "grip" and "conductor" mean nothing to someone
 * choosing an illustration for their lesson, and a list of slugs would make the
 * override feature unusable by exactly the person it is for.
 *
 * VISUAL_IDS is the allow-list the resolver checks an override against, so
 * removing a visual here is enough — no migration, and an id that no longer
 * ships degrades to no picture rather than a broken lesson.
 */
/**
 * A visual, with the subject its section has to be about.
 *
 * `requires` is the honesty rule as code rather than as an instruction. Twice
 * now a model has been told, in plain words, that these interactives are about
 * magnetism and turning forces — and twice it has proposed one for a section
 * about a car travelling at a steady speed. Once with an argument ("the beam
 * can model equal changes over equal intervals") and once by simply changing
 * the subject in its reason. An instruction it can talk itself out of is not a
 * rule; a regex it never sees is.
 *
 * Deliberately much weaker than the matching RULES below. Those need a pattern
 * in the HEADING and another in the TEXT, which is what makes matching
 * conservative enough to leave most sections bare. This asks only that the
 * subject appears somewhere — it is a floor under the model's judgement, not a
 * second matcher, and it must not undo the coverage the model exists to add.
 *
 * The test to apply when adding a visual: what would a student conclude if
 * this were drawn beside a section that never mentions the subject? For
 * `distance` — which renders two bar magnets — the answer on a kinematics
 * section is "magnets have something to do with trains", and that is the
 * failure this prevents.
 */
export type VisualEntry = { id: VisualKind; label: string; blurb: string; requires: RegExp };

export const VISUALS: VisualEntry[] = [
  {
    id: "lever",
    label: "Balance a beam",
    blurb: "Load each side and watch the moments",
    requires: /(moment|lever|see-?saw|pivot|turning|balanc|torque)/i,
  },
  {
    id: "field",
    label: "Field around a bar magnet",
    blurb: "Turn it in three dimensions",
    requires: /(magnet|pole|field)/i,
  },
  {
    id: "domains",
    label: "Magnetic domains",
    blurb: "Align them and watch magnetism appear",
    requires: /(magnet|domain)/i,
  },
  {
    id: "broken",
    label: "Breaking a magnet",
    blurb: "Every piece keeps two poles",
    requires: /(magnet|pole)/i,
  },
  {
    id: "electromagnet",
    label: "Electromagnet on and off",
    blurb: "Switch the current, drop the load",
    requires: /(electromagnet|solenoid|coil|current)/i,
  },
  {
    id: "conductor",
    label: "Field around a straight wire",
    blurb: "Concentric circles, not loops",
    requires: /(wire|conductor|current)/i,
  },
  {
    id: "grip",
    label: "Right-hand grip rule",
    blurb: "Find the north end of a solenoid",
    requires: /(solenoid|coil|current|grip)/i,
  },
  {
    // Four of the fourteen sections in this school's motion deck are about the
    // gradient — the largest cluster in the whole corpus with nothing to show
    // for it, including a worked example the widget reproduces exactly.
    id: "gradient",
    label: "Slope of a distance-time graph",
    blurb: "Move A and B, and read the speed off the gradient",
    requires: /(gradient|slope|speed|distance[- ]time|motion graph)/i,
  },
  {
    // Already built, for the hand-made demo topic, and unavailable to every
    // uploaded deck since. Promoting it costs nothing and covers "I walked 5 m
    // in 10 seconds, stopped for 10 seconds, then walked 5 m in 5 seconds"
    // exactly.
    id: "journey",
    label: "Sketch a journey",
    blurb: "Walk, stop, walk — and watch the graph draw itself",
    requires: /(journey|distance[- ]time|motion|speed|stopped|not moving|walk)/i,
  },
  {
    // Two bar magnets and the field between them, so a section with no magnet
    // in it can never have this. That is the exact false positive that made
    // `requires` exist.
    id: "distance",
    label: "Force against distance",
    blurb: "Closer means stronger",
    requires: /(magnet|pole)/i,
  },
];

export const VISUAL_IDS: readonly VisualKind[] = VISUALS.map((v) => v.id);

// Ordered most specific first, and the first match wins.
//
// The earlier version was not as conservative as its comment claimed. Two
// loose regexes agreeing is not evidence: "magnetic field strength" in a
// heading about the right-hand thumb rule matched the bar-magnet rule, and a
// section on why solenoids use insulated wire matched the electromagnet rule.
// Both rendered a diagram of the wrong thing, which is worse than rendering
// nothing.
//
// So each rule now carries an `unless` guard naming the neighbouring concepts
// it must yield to, and the specific concepts sit above the general ones.
const RULES: { kind: VisualKind; when: RegExp; needs: RegExp; unless?: RegExp }[] = [
  {
    // Gradient first: "slope" and "gradient" are unambiguous in a motion deck,
    // and this is the concept the deck returns to most.
    kind: "gradient",
    when: /(gradient|slope)/i,
    needs: /(speed|distance|graph|calculate|m\/s)/i,
    unless: /(magnet|pole|field line)/i,
  },
  {
    // A journey with pauses, and the shapes a distance-time graph makes. The
    // heading has to name the graph or the motion — "distance" alone is not
    // enough, because a magnetism deck says "force acting at a distance".
    kind: "journey",
    when: /(distance[- ]?time|motion graph|journey|not moving|steady speed|uniform motion)/i,
    needs: /(time|speed|graph|second|m\/s)/i,
    unless: /(magnet|pole|solenoid|current)/i,
  },
  {
    // Moments. First because "moment", "pivot" and "turning effect" are
    // unambiguous in a mechanics deck, and because until now this topic had no
    // visual at all — an eight-section deck about levers rendered nothing but
    // the teacher's slide images.
    //
    // The `unless` earns its place here more than anywhere else in this list: a
    // compass needle in a field genuinely experiences a turning effect, and
    // "magnetic moment" is a real term. Either would have put a see-saw in the
    // middle of a magnetism lesson.
    kind: "lever",
    when: /(moment|lever|see-?saw|\bbeam|pivot|turning effect|equilibrium)/i,
    needs: /(force|distance|pivot|turning point|clockwise|balanc)/i,
    unless: /(magnet|compass|dipole|solenoid|current)/i,
  },
  {
    kind: "domains",
    when: /domain/i,
    needs: /(align|line up|same direction|magnetis)/i,
  },
  {
    kind: "broken",
    when: /(broken|break|cut in half|piece)/i,
    needs: /(pole|north|south)/i,
  },
  {
    // The field around a straight wire is a different picture from the field
    // around a bar magnet: concentric circles, not loops between poles.
    kind: "conductor",
    when: /(thumb rule|current[- ]carrying|straight wire|around a wire|around a conductor)/i,
    needs: /(current|field|direction)/i,
    unless: /(solenoid|coil|grip rule)/i,
  },
  {
    kind: "grip",
    when: /grip rule/i,
    needs: /(solenoid|coil|current|north)/i,
  },
  {
    kind: "electromagnet",
    when: /(electromagnet|solenoid|coil)/i,
    needs: /(current|switch|turned on|on and off|strength)/i,
    // A section about insulation, copper or short circuits is about wiring
    // materials, not about switching a field on and off.
    unless: /(insulat|copper wire|resistance|short circuit|grip rule|thumb rule)/i,
  },
  {
    kind: "distance",
    when: /distance/i,
    needs: /(force|closer|greater|strength)/i,
    unless: /(wire|conductor|solenoid)/i,
  },
  {
    kind: "field",
    when: /(magnetic field|field around|field line)/i,
    needs: /(pole|region|bar magnet)/i,
    // Everything current-related has a more specific rule above; without this
    // the generic bar-magnet picture swallowed conductor and solenoid
    // sections whose headings merely contained "magnetic field".
    unless: /(conductor|wire|solenoid|coil|current|thumb rule|grip rule)/i,
  },
];

export function visualFor(heading: string, text: string): VisualKind | null {
  const both = `${heading} ${text}`;
  for (const rule of RULES) {
    if (rule.unless?.test(both)) continue;
    if (rule.when.test(heading) && rule.needs.test(text)) return rule.kind;
  }
  return null;
}

// Picks which section gets which visual across a whole lesson.
//
// Repetition was the other half of the problem: a deck covering
// electromagnets from five angles rendered the same coil widget five times,
// which reads as automation rather than authorship. A concept earns its
// interactive once, at the first section that matches it.
/**
 * How much a section ASKS THE STUDENT TO USE the concept, rather than state it.
 *
 * Matching used to give a concept's interactive to the first section that
 * mentioned it, which on the school's motion deck put the gradient widget on
 * "Gradient and speed" — one sentence saying the slope gives you speed — while
 * three sections later "Worked example: gradient equals speed" asks a student to
 * calculate one, using the very numbers the widget opens on. The interactive was
 * three screens above the exercise it answers.
 *
 * So a section that sets work beats one that introduces a term. The signals are
 * the vocabulary a deck actually uses for that — an instruction to do something,
 * a task heading, or an equation worked through — and each is worth naming
 * separately so a wrong placement can be argued about by pointing at a line.
 *
 * Deliberately blunt. This only chooses BETWEEN sections that already matched
 * the same visual, so a false positive costs at most a placement one section
 * away from where it would otherwise have been, and never an interactive on a
 * section that does not match at all.
 */
export function applicationScore(heading: string, text: string): number {
  const both = `${heading} ${text}`;
  let score = 0;

  // A deck's own words for "now you try": worked examples and check-for-
  // understanding tasks are where a student is holding a pencil.
  if (/worked example|check for understanding|\btask\b|your turn|now try/i.test(both)) score += 2;

  // An instruction to do the thing, rather than a description of it.
  if (/\b(calculate|sketch|plot|complete the|work out|find the|measure)\b/i.test(both)) score += 2;

  // Arithmetic carried out on the page. Two numbers and an equals sign is a
  // worked calculation; a lone figure in prose is not.
  if (/=/.test(text) && (text.match(/\d/g) ?? []).length >= 3) score += 1;

  return score;
}

export function assignVisuals(sections: { heading: string; text: string; hasMedia: boolean }[]): (VisualKind | null)[] {
  const used = new Set<VisualKind>();

  // One ranking, not two passes.
  //
  // Not having the teacher's own diagram used to be an absolute preference: a
  // media-less section always took the interactive, however weak a home it was.
  // The reasoning was sound as far as it went — a static picture and something
  // you can turn in your hands do different jobs, so a section with neither
  // should be served first. But it was doing more work than it was meant to.
  //
  // On the school's motion deck it put the gradient widget on "Gradient and
  // speed", one sentence saying the slope gives you speed, while "Worked
  // example: gradient equals speed" — which asks a student to calculate one,
  // from the very numbers the widget opens on — was passed over for carrying a
  // picture of the graph. That picture is the exercise. Being able to drag the
  // points of the graph you have just been asked about is the best pairing in
  // the deck, and the rule was reading it as the worst.
  //
  // So the diagram is a TIEBREAK now, worth less than a section that sets work.
  // Where no section sets work — which is every section of the magnetism deck —
  // every application score is zero and this behaves exactly as it did before.
  const kinds = sections.map((s) => visualFor(s.heading, s.text));
  const rank = sections.map(
    (s) => applicationScore(s.heading, s.text) * 2 + (s.hasMedia ? 0 : 1),
  );
  const assigned: (VisualKind | null)[] = sections.map(() => null);

  // The best home for each concept, ties broken by reading order.
  const best = new Map<VisualKind, number>();
  sections.forEach((_, i) => {
    const kind = kinds[i];
    if (!kind || used.has(kind)) return;
    const current = best.get(kind);
    if (current === undefined || rank[i] > rank[current]) best.set(kind, i);
  });

  for (const [kind, i] of best) {
    used.add(kind);
    assigned[i] = kind;
  }

  return assigned;
}

