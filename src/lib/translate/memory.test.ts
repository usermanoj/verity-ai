import { describe, expect, it } from "vitest";
import { sourceHash } from "./memory";

describe("sourceHash", () => {
  it("gives the same key for the same passage", () => {
    const text = "The magnetic field is strongest inside the coil.";
    expect(sourceHash(text)).toBe(sourceHash(text));
  });

  it("ignores whitespace the model may re-wrap", () => {
    // A correction must not be orphaned from its passage because a reply came
    // back with a different line break.
    const a = "An electromagnet is made\nby passing current through a coil.";
    const b = "An electromagnet is made by passing current   through a coil.";
    expect(sourceHash(a)).toBe(sourceHash(b));
  });

  it("ignores leading and trailing space", () => {
    expect(sourceHash("  Iron is magnetic.  ")).toBe(sourceHash("Iron is magnetic."));
  });

  it("distinguishes passages that differ in a number", () => {
    // The whole point of the memory is that it is keyed on the exact content:
    // "7 N" and "5 N" are different passages and must not share a translation.
    expect(sourceHash("A force of 7 N acts here.")).not.toBe(sourceHash("A force of 5 N acts here."));
  });

  it("distinguishes passages that differ only in wording", () => {
    expect(sourceHash("Iron is magnetic.")).not.toBe(sourceHash("Iron is magnetised."));
  });

  it("is a hex digest, so it is safe as a database key", () => {
    expect(sourceHash("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
