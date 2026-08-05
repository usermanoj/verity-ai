import { describe, expect, it } from "vitest";
import { namedSections, resolveNamed, unknownSections } from "./citations";

// The three real replies that named a section are the fixtures. All three
// pointed at pages that exist — this exists so the fourth one cannot go
// unnoticed.

const DECK = [
  "Magnets and Electromagnets.pptx — Page/Section 1",
  "Magnets and Electromagnets.pptx — Page/Section 3",
  "Magnets and Electromagnets.pptx — Page/Section 32",
  "Magnets and Electromagnets.pptx — Page/Section 35",
];

describe("namedSections", () => {
  it("finds nothing in a reply that obeyed the prompt", () => {
    // Fifty-eight of sixty-one. This is the case that has to be free, because
    // it is nearly every case.
    expect(namedSections("An electromagnet can be switched on and off.")).toEqual([]);
    expect(namedSections("")).toEqual([]);
  });

  it("reads the one the model actually wrote", () => {
    // Verbatim from the transcript, emoji and all.
    const out = namedSections(
      "An electromagnet is more useful in a scrapyard because it can be switched on and off.\n\n📖 Based on: Magnets and Electromagnets.pptx — Page/Section 32",
    );
    expect(out).toEqual([{ file: "Magnets and Electromagnets.pptx", page: 32 }]);
  });

  it("reads more than one from a single reply", () => {
    const out = namedSections(
      "Based on: A.pptx — Page/Section 1\nand also Based on: A.pptx — Page/Section 3",
    );
    expect(out.map((n) => n.page)).toEqual([1, 3]);
  });
});

describe("unknownSections", () => {
  it("passes the three real citations", () => {
    // If this ever fails, the guard has started accusing the tutor of
    // something it did not do — which is worse than the gap it closes.
    const named = [1, 3, 32].map((page) => ({ file: "Magnets and Electromagnets.pptx", page }));
    expect(unknownSections(named, DECK)).toEqual([]);
  });

  it("catches a page the deck does not have", () => {
    // The failure worth finding: a child told their teacher's slide 40 says
    // something, on a deck that stops at 35.
    const out = unknownSections([{ file: "Magnets and Electromagnets.pptx", page: 40 }], DECK);
    expect(out).toEqual([{ file: "Magnets and Electromagnets.pptx", page: 40 }]);
  });

  it("says nothing when there is nothing to check", () => {
    expect(unknownSections([], DECK)).toEqual([]);
  });

  it("stays quiet when the corpus has no page numbers to compare against", () => {
    // A deck whose citations do not parse cannot judge a reply, and flagging
    // every section would be a wall of noise about the corpus rather than
    // about the tutor.
    expect(unknownSections([{ file: "x", page: 9 }], ["a legacy citation with no page"])).toEqual([]);
  });
});

describe("resolveNamed", () => {
  const chunks = [
    { id: "c1", source: "Magnets and Electromagnets.pptx — Page/Section 1" },
    { id: "c32", source: "Magnets and Electromagnets.pptx — Page/Section 32" },
  ];

  it("turns a claimed section into the chunk it names", () => {
    // Recorded on the turn, so the next audit is a query rather than a parse
    // of sixty-one replies.
    expect(resolveNamed([{ file: "x", page: 32 }], chunks)).toEqual(["c32"]);
  });

  it("drops one that resolves to nothing rather than guessing a neighbour", () => {
    expect(resolveNamed([{ file: "x", page: 40 }], chunks)).toEqual([]);
  });

  it("has nothing to record for a reply that named nothing", () => {
    expect(resolveNamed([], chunks)).toEqual([]);
  });
});
