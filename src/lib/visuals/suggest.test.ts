import { describe, expect, it } from "vitest";
import {
  catalogueForPrompt,
  keepValidSuggestions,
  sectionsForPrompt,
  sectionsNeedingSuggestion,
  type RawSuggestion,
  type SectionForSuggestion,
} from "./suggest";
import type { Resolved } from "./resolve";

// The model's output is untrusted input. These tests are about what happens to
// the answers that are wrong — an invented visual id, a section that was never
// offered, a second copy of something already on screen — because a suggestion
// that survives those checks is one a teacher will be asked to approve.

// A catalogue, not a list of ids: a suggestion now has to be for a section
// that is actually about the visual's subject, so the test data has to carry
// the subject too.
const KNOWN = [
  { id: "lever" as const, requires: /(moment|pivot|balanc)/i },
  { id: "field" as const, requires: /(magnet|pole|field)/i },
  { id: "domains" as const, requires: /(magnet|domain)/i },
];

const section = (
  chunkId: string,
  heading = "A section",
  text = "The moment of a force about a pivot.",
): SectionForSuggestion => ({
  chunkId,
  heading,
  text,
});

const auto = (visual: string | null): Resolved => ({ visual, source: "automatic" });

describe("sectionsNeedingSuggestion", () => {
  it("asks about the sections matching left bare", () => {
    const sections = [section("c1"), section("c2")];
    const out = sectionsNeedingSuggestion(sections, [auto("lever"), auto(null)]);
    expect(out.map((s) => s.chunkId)).toEqual(["c2"]);
  });

  it("never re-offers a section the teacher turned off", () => {
    // They looked at it and said no. An assistant that proposes the same thing
    // again on every page load is not assisting.
    const out = sectionsNeedingSuggestion(
      [section("c1")],
      [{ visual: null, source: "hidden" }],
    );
    expect(out).toEqual([]);
  });

  it("leaves a section the teacher chose something for alone", () => {
    const out = sectionsNeedingSuggestion([section("c1")], [{ visual: "lever", source: "chosen" }]);
    expect(out).toEqual([]);
  });

  it("survives a resolution list shorter than the sections", () => {
    // Defensive rather than expected: a mismatch here would otherwise read
    // `undefined.visual` and take down the whole suggestion pass.
    expect(sectionsNeedingSuggestion([section("c1")], [])).toEqual([]);
  });
});

describe("keepValidSuggestions", () => {
  const eligible = [section("c1"), section("c2"), section("c3")];
  const ok = (over: Partial<RawSuggestion> = {}): RawSuggestion => ({
    chunkId: "c1",
    visual: "lever",
    reason: "This section defines the moment of a force.",
    ...over,
  });

  it("keeps a well-formed suggestion", () => {
    expect(keepValidSuggestions([ok()], eligible, KNOWN)).toEqual([
      { chunkId: "c1", visual: "lever", reason: "This section defines the moment of a force." },
    ]);
  });

  it("drops a visual this codebase does not ship", () => {
    // The failure mode is the model inventing a plausible id. Accepting one
    // would store a choice that renders as nothing, which looks to a teacher
    // exactly like the feature being broken.
    expect(keepValidSuggestions([ok({ visual: "particle-accelerator" })], eligible, KNOWN)).toEqual([]);
  });

  it("drops a suggestion for a section that was not offered", () => {
    expect(keepValidSuggestions([ok({ chunkId: "somewhere-else" })], eligible, KNOWN)).toEqual([]);
  });

  it("drops a visual already on screen elsewhere in the lesson", () => {
    expect(keepValidSuggestions([ok()], eligible, KNOWN, ["lever"])).toEqual([]);
  });

  it("keeps only the first suggestion for a section", () => {
    const out = keepValidSuggestions([ok(), ok({ visual: "field" })], eligible, KNOWN);
    expect(out).toHaveLength(1);
    expect(out[0].visual).toBe("lever");
  });

  it("keeps only the first suggestion of a visual", () => {
    const out = keepValidSuggestions([ok(), ok({ chunkId: "c2" })], eligible, KNOWN);
    expect(out.map((s) => s.chunkId)).toEqual(["c1"]);
  });

  it("drops a suggestion with no reason", () => {
    // The reason is the whole basis on which a teacher can say yes without
    // reopening the deck. Without one this is a guess wearing a
    // recommendation's clothes.
    expect(keepValidSuggestions([ok({ reason: "   " })], eligible, KNOWN)).toEqual([]);
    expect(keepValidSuggestions([ok({ reason: undefined })], eligible, KNOWN)).toEqual([]);
  });

  it("survives a model that answers with the wrong types entirely", () => {
    const junk: RawSuggestion[] = [
      { chunkId: 7, visual: ["lever"], reason: null },
      { chunkId: "c1", visual: null, reason: "because" },
    ];
    expect(keepValidSuggestions(junk, eligible, KNOWN)).toEqual([]);
  });

  it("returns nothing for an empty answer, which is a good answer", () => {
    expect(keepValidSuggestions([], eligible, KNOWN)).toEqual([]);
  });
});

describe("the subject gate, on the real sections that made it necessary", () => {
  // Verbatim from the school's decks. Both of these were proposed by the model
  // in production; one is right and one would have drawn two bar magnets in a
  // lesson about a train.
  const KINEMATICS = section(
    "k1",
    "Steady speed and reference points",
    "Two passengers are sitting in a compartment of a moving train. Are they in motion with respect to each other? " +
      "If a car covers a distance of 6m every second, is it in uniform or non-uniform motion? " +
      "Do we need reference points to describe motion of an object.",
  );
  const MAGNETS = section(
    "m1",
    "Forces between magnets",
    "Closer the poles, greater is the force. This is used to understand that magnets attract and repel other magnets.",
  );
  const CATALOGUE = [{ id: "distance" as const, requires: /(magnet|pole)/i }];

  it("refuses a magnetism visual for a section with no magnet in it", () => {
    // The model proposed exactly this, twice, with two different
    // justifications — the second of which never mentioned force at all:
    // "This section says a car covering 6 m every second is in uniform motion."
    // True about the section, and no reason to draw two bar magnets beside it.
    const out = keepValidSuggestions(
      [{ chunkId: "k1", visual: "distance", reason: "This section says a car covers 6 m every second." }],
      [KINEMATICS],
      CATALOGUE,
    );
    expect(out).toEqual([]);
  });

  it("still allows the suggestion that was right", () => {
    // The gate has to be a floor, not a second matcher. If it also blocks this
    // one, the feature has no purpose left.
    const out = keepValidSuggestions(
      [{ chunkId: "m1", visual: "distance", reason: "This section states that closer poles produce a greater force." }],
      [MAGNETS],
      CATALOGUE,
    );
    expect(out).toHaveLength(1);
    expect(out[0].visual).toBe("distance");
  });

  it("refuses a beam for a section about steady speed", () => {
    // The other production failure: a see-saw for a car at constant speed,
    // justified as "equal changes over equal intervals".
    const out = keepValidSuggestions(
      [{ chunkId: "k1", visual: "lever", reason: "A steady rate is equal changes over equal intervals." }],
      [KINEMATICS],
      [{ id: "lever" as const, requires: /(moment|lever|see-?saw|pivot|turning|balanc|torque)/i }],
    );
    expect(out).toEqual([]);
  });
});

describe("prompt building", () => {
  it("names each section by an id the answer can be looked up by", () => {
    const text = sectionsForPrompt([section("c1", "Moments", "Force times distance.")]);
    expect(text).toContain("[c1] Moments");
    expect(text).toContain("Force times distance.");
  });

  it("truncates a long section rather than sending the whole deck", () => {
    const text = sectionsForPrompt([section("c1", "Long", "x".repeat(5000))], 100);
    expect(text.length).toBeLessThan(300);
    expect(text).toContain("…");
  });

  it("says which section has no heading rather than leaving a gap", () => {
    expect(sectionsForPrompt([section("c1", "", "Body.")])).toContain("(no heading)");
  });

  it("offers the model the same ids the picker accepts", () => {
    const text = catalogueForPrompt([{ id: "lever", label: "Balance a beam", blurb: "Load each side" }]);
    expect(text).toContain("lever — Balance a beam: Load each side");
  });
});
