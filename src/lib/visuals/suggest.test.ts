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

const KNOWN = ["lever", "field", "domains"] as const;

const section = (chunkId: string, heading = "A section", text = "Some words."): SectionForSuggestion => ({
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
