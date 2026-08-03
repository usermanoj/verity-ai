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
  | "lever";

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
export const VISUALS: { id: VisualKind; label: string; blurb: string }[] = [
  { id: "lever", label: "Balance a beam", blurb: "Load each side and watch the moments" },
  { id: "field", label: "Field around a bar magnet", blurb: "Turn it in three dimensions" },
  { id: "domains", label: "Magnetic domains", blurb: "Align them and watch magnetism appear" },
  { id: "broken", label: "Breaking a magnet", blurb: "Every piece keeps two poles" },
  { id: "electromagnet", label: "Electromagnet on and off", blurb: "Switch the current, drop the load" },
  { id: "conductor", label: "Field around a straight wire", blurb: "Concentric circles, not loops" },
  { id: "grip", label: "Right-hand grip rule", blurb: "Find the north end of a solenoid" },
  { id: "distance", label: "Force against distance", blurb: "Closer means stronger" },
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
export function assignVisuals(sections: { heading: string; text: string; hasMedia: boolean }[]): (VisualKind | null)[] {
  const used = new Set<VisualKind>();

  // Two passes, so a concept's interactive is not spent on a section that
  // already has the teacher's own diagram.
  //
  // The first version skipped any section with media outright, which made the
  // two mutually exclusive — a static picture OR something to try, never
  // both. That was the wrong call: a diagram of field lines and a field you
  // can turn in your hands do different jobs, and the deck's best-illustrated
  // sections were exactly the ones being denied interaction. Now a section
  // with media keeps its diagram and takes the interactive only if no
  // media-less section elsewhere in the lesson wants it.
  const kinds = sections.map((s) => visualFor(s.heading, s.text));
  const assigned: (VisualKind | null)[] = sections.map(() => null);

  for (const preferMediaLess of [true, false]) {
    sections.forEach((s, i) => {
      if (assigned[i]) return;
      if (preferMediaLess === s.hasMedia) return;
      const kind = kinds[i];
      if (!kind || used.has(kind)) return;
      used.add(kind);
      assigned[i] = kind;
    });
  }

  return assigned;
}
