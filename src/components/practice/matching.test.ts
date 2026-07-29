import { describe, expect, it } from "vitest";
import { availableMeanings, parseMatchingAnswer } from "./PracticeZone";

// The four meanings from the real Magnets question that prompted this.
const MEANINGS = [
  "Indian surgeon who used magnets for surgical purposes",
  "iron mineral used to make lodestones",
  "natural magnet made of the iron mineral magnetite",
  "used for navigation",
];

describe("availableMeanings", () => {
  it("offers everything when nothing is chosen", () => {
    expect(availableMeanings(MEANINGS, [], 0)).toEqual(MEANINGS);
  });

  it("closes a meaning another row has taken", () => {
    // The bug in the screenshot: lodestone and magnetite could both be given
    // "iron mineral used to make lodestones", which is never a right answer,
    // only an impossible one.
    const chosen = ["iron mineral used to make lodestones", undefined, undefined, undefined];
    expect(availableMeanings(MEANINGS, chosen, 1)).not.toContain("iron mineral used to make lodestones");
  });

  it("keeps a row's OWN answer available to it", () => {
    // Otherwise the select holds a value its option list does not contain,
    // and the browser shows the row as empty.
    const chosen = ["used for navigation", undefined, undefined, undefined];
    expect(availableMeanings(MEANINGS, chosen, 0)).toContain("used for navigation");
  });

  it("narrows to a single option for the last row", () => {
    const chosen = [MEANINGS[0], MEANINGS[1], MEANINGS[2], undefined];
    expect(availableMeanings(MEANINGS, chosen, 3)).toEqual([MEANINGS[3]]);
  });

  it("reopens a meaning when the row holding it is cleared", () => {
    // "Choose…" is the escape hatch — a student must never be trapped by an
    // early wrong pick.
    const chosen = [undefined, undefined, undefined, undefined];
    expect(availableMeanings(MEANINGS, chosen, 2)).toEqual(MEANINGS);
  });
});

describe("parseMatchingAnswer", () => {
  it("reads a row-keyed answer back", () => {
    expect(parseMatchingAnswer("0=alpha\n2=gamma", 3)).toEqual(["alpha", undefined, "gamma"]);
  });

  it("returns an empty slate for an empty answer", () => {
    expect(parseMatchingAnswer("", 3)).toEqual([undefined, undefined, undefined]);
  });
});
