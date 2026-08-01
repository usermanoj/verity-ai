import { describe, expect, it } from "vitest";
import { dedupe, resolveVisuals, type VisualOverride } from "./resolve";

// The difference between "no row" and "a row holding null" is the whole
// feature. Collapse them and a teacher can never say "show nothing here" —
// which is the correction they most often want, because a diagram of the wrong
// thing is the failure worth undoing in one click.

const KNOWN = ["lever", "field", "domains"] as const;
const ids = ["c1", "c2", "c3"];

describe("resolveVisuals", () => {
  it("uses matching when the teacher has said nothing", () => {
    const out = resolveVisuals(ids, ["lever", null, "field"], [], KNOWN);
    expect(out.map((r) => r.visual)).toEqual(["lever", null, "field"]);
    expect(out.every((r) => r.source === "automatic")).toBe(true);
  });

  it("lets a teacher move a visual to a different section", () => {
    // Matching put the lever on the formula section; this teacher introduces
    // levers in section 3.
    const overrides: VisualOverride[] = [
      { chunkId: "c1", visual: null },
      { chunkId: "c3", visual: "lever" },
    ];
    const out = resolveVisuals(ids, ["lever", null, null], overrides, KNOWN);
    expect(out[0]).toEqual({ visual: null, source: "hidden" });
    expect(out[2]).toEqual({ visual: "lever", source: "chosen" });
  });

  it("distinguishes hidden from automatic-with-no-match", () => {
    // Both render nothing. Only one of them is a decision, and the teacher's
    // screen has to be able to tell them apart or the checkbox will not stay
    // where they put it.
    const out = resolveVisuals(["c1", "c2"], [null, null], [{ chunkId: "c1", visual: null }], KNOWN);
    expect(out[0].source).toBe("hidden");
    expect(out[1].source).toBe("automatic");
  });

  it("overrides a match the teacher disagrees with", () => {
    const out = resolveVisuals(["c1"], ["field"], [{ chunkId: "c1", visual: "domains" }], KNOWN);
    expect(out[0]).toEqual({ visual: "domains", source: "chosen" });
  });

  it("degrades a visual the code no longer ships to nothing, not a crash", () => {
    // A teacher's choice outlives a refactor. A removed visual must be a
    // missing picture, never a broken lesson.
    const out = resolveVisuals(["c1"], [null], [{ chunkId: "c1", visual: "retired-widget" }], KNOWN);
    expect(out[0].visual).toBeNull();
  });

  it("ignores an override for a section that is not in this lesson", () => {
    const out = resolveVisuals(["c1"], ["lever"], [{ chunkId: "somewhere-else", visual: null }], KNOWN);
    expect(out[0].visual).toBe("lever");
  });
});

describe("dedupe", () => {
  it("shows a concept's interactive once", () => {
    // Five identical coil widgets in one lesson reads as automation rather
    // than authorship.
    const out = dedupe([
      { visual: "lever", source: "automatic" },
      { visual: "lever", source: "automatic" },
    ]);
    expect(out.map((r) => r.visual)).toEqual(["lever", null]);
  });

  it("gives a contested visual to the section the teacher chose", () => {
    // They looked at the lesson; the regex looked at a string.
    const out = dedupe([
      { visual: "lever", source: "automatic" },
      { visual: "lever", source: "chosen" },
    ]);
    expect(out[0].visual).toBeNull();
    expect(out[1].visual).toBe("lever");
  });

  it("keeps different visuals side by side", () => {
    const out = dedupe([
      { visual: "lever", source: "chosen" },
      { visual: "field", source: "automatic" },
    ]);
    expect(out.map((r) => r.visual)).toEqual(["lever", "field"]);
  });

  it("does not mutate what it was given", () => {
    const input = [
      { visual: "lever", source: "automatic" as const },
      { visual: "lever", source: "automatic" as const },
    ];
    dedupe(input);
    expect(input.map((r) => r.visual)).toEqual(["lever", "lever"]);
  });

  it("leaves hidden sections hidden", () => {
    const out = dedupe([{ visual: null, source: "hidden" }, { visual: "lever", source: "automatic" }]);
    expect(out[0]).toEqual({ visual: null, source: "hidden" });
    expect(out[1].visual).toBe("lever");
  });
});
