import { describe, expect, it } from "vitest";
import { checkTranslation, hasBlockingIssue, type Glossary } from "./checks";

const GLOSSARY: Glossary = {
  "magnetic field": { en: "space around a magnet", zh: "磁场（磁铁周围能作用的空间）" },
  solenoid: { en: "a long coil of wire", zh: "螺线管" },
};

const codes = (source: string, out: string, g: Glossary = GLOSSARY) =>
  checkTranslation(source, out, g).map((i) => i.code);

describe("checkTranslation — a good translation", () => {
  it("passes a faithful rendering with the agreed terms", () => {
    const source = "The magnetic field around a solenoid is strongest inside the coil.";
    const out = "螺线管周围的磁场在线圈内部最强。";
    expect(checkTranslation(source, out, GLOSSARY)).toEqual([]);
  });

  it("accepts a source with no letters to translate", () => {
    // A bare formula is legitimately returned unchanged.
    expect(codes("7 × 0.4 = 2.8", "7 × 0.4 = 2.8")).toEqual([]);
  });
});

describe("checkTranslation — numbers", () => {
  it("catches a changed quantity", () => {
    // The failure a student reading in a second language cannot catch: the
    // Chinese is fluent and the physics is wrong.
    const source = "A force of 7 N acts 0.4 m from the pivot.";
    const out = "支点外 0.4 米处作用着 5 牛顿的力。";
    expect(codes(source, out)).toContain("numbers_changed");
  });

  it("names the number that went missing", () => {
    const issues = checkTranslation("Use 12 volts.", "使用电压。", {});
    expect(issues[0].detail).toContain("12");
  });

  it("treats a decimal written with a comma as the same number", () => {
    expect(codes("It is 0.4 m long.", "它长 0,4 米。", {})).not.toContain("numbers_changed");
  });

  it("allows extra numbers the Chinese needs", () => {
    expect(codes("Two poles.", "有 2 个磁极。", {})).not.toContain("numbers_changed");
  });
});

describe("checkTranslation — terminology", () => {
  it("flags a term rendered with something other than the approved form", () => {
    // 磁力线 is a real phrase, but it is not the one the lesson uses, so the
    // student cannot match the translation back to the material.
    const source = "The magnetic field is strongest at the poles.";
    const out = "磁力线在两极最强。";
    expect(codes(source, out)).toContain("glossary_term_missing");
  });

  it("accepts the head term without its bracketed explanation", () => {
    const source = "Draw the magnetic field.";
    expect(codes(source, "画出磁场。")).not.toContain("glossary_term_missing");
  });

  it("only requires terms that are actually in the source", () => {
    // "solenoid" is in the glossary but not this sentence.
    expect(codes("Draw the magnetic field.", "画出磁场。")).toEqual([]);
  });

  it("does not match a term inside a longer word", () => {
    expect(codes("The solenoidal flow is different.", "这种流动不同。", GLOSSARY)).not.toContain(
      "glossary_term_missing",
    );
  });
});

describe("checkTranslation — failures of the whole output", () => {
  it("rejects an empty translation", () => {
    expect(codes("Anything at all.", "   ")).toEqual(["empty"]);
  });

  it("rejects English returned unchanged", () => {
    const source = "The iron becomes magnetised inside the coil.";
    expect(codes(source, source)).toContain("untranslated");
  });

  it("rejects a preamble instead of a translation", () => {
    expect(codes("Iron is magnetic.", "Sure! Here is the translation: 铁有磁性。")).toContain(
      "not_a_translation",
    );
    expect(codes("Iron is magnetic.", "以下是译文：铁有磁性。")).toContain("not_a_translation");
  });

  it("flags a translation that stops a third of the way through", () => {
    const source =
      "An electromagnet is made by passing an electric current through a coil of wire. " +
      "When the current flows, the coil behaves like a magnet. Placing an iron core inside " +
      "the coil makes the magnetic field much stronger, and switching the current off makes " +
      "the iron lose almost all of its magnetism.";
    expect(codes(source, "电磁铁由电流通过线圈制成。", {})).toContain("too_short");
  });

  it("does not call a normal translation truncated", () => {
    const source =
      "An electromagnet is made by passing an electric current through a coil of wire. " +
      "When the current flows, the coil behaves like a magnet.";
    const out =
      "电磁铁是通过让电流通过线圈而制成的。当电流流动时，线圈的表现就像一块磁铁一样，能够吸引铁、镍等磁性材料。";
    expect(codes(source, out, {})).not.toContain("too_short");
  });
});

describe("hasBlockingIssue", () => {
  it("separates what must be retried from what is only worth logging", () => {
    // A wrong number is a fact changed; a term rendered differently is worth
    // knowing about but must not deny the student their translation.
    expect(hasBlockingIssue(checkTranslation("Use 12 volts.", "使用电压。", {}))).toBe(true);
    expect(
      hasBlockingIssue(checkTranslation("The magnetic field is here.", "磁力线在这里。", GLOSSARY)),
    ).toBe(false);
  });

  it("is false for a clean translation", () => {
    expect(hasBlockingIssue(checkTranslation("Iron is magnetic.", "铁有磁性。", {}))).toBe(false);
  });
});
