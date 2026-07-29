import { describe, expect, it } from "vitest";
import { splitLegacyLevel, buildSystemPrompt, type EslLevel } from "./tutor";

const LEVELS: EslLevel[] = ["advanced", "intermediate", "beginner"];

const prompt = (level: EslLevel, chinese: boolean) =>
  buildSystemPrompt("moments", level, "explain", 0, false, chinese);

describe("splitLegacyLevel", () => {
  it("splits the old combined value into both answers", () => {
    // "beginner_zh" answered two questions at once. Discarding either half
    // would silently change what a student had already chosen.
    expect(splitLegacyLevel("beginner_zh")).toEqual({ level: "beginner", chinese: true });
  });

  it("leaves a plain level alone, with Chinese off", () => {
    expect(splitLegacyLevel("advanced")).toEqual({ level: "advanced", chinese: false });
    expect(splitLegacyLevel("intermediate")).toEqual({ level: "intermediate", chinese: false });
    expect(splitLegacyLevel("beginner")).toEqual({ level: "beginner", chinese: false });
  });
});

describe("reading level and Chinese are independent", () => {
  it("allows full English WITH Chinese — the combination the old list could not express", async () => {
    // A strong reader who is new to the language: normal academic English,
    // with 中文 for the terms that block them.
    const text = await prompt("advanced", true);
    expect(text).toContain("strong English");
    expect(text).toContain("中文");
  });

  it("keeps Chinese off at every level unless asked", async () => {
    for (const level of LEVELS) {
      expect(await prompt(level, false)).not.toContain("中文");
    }
  });

  it("adds Chinese at every level when asked", async () => {
    for (const level of LEVELS) {
      expect(await prompt(level, true)).toContain("中文");
    }
  });

  it("still pitches the English at the chosen level when Chinese is on", async () => {
    // The Chinese must not quietly drag every reply down to beginner English,
    // which is what the single combined option effectively did.
    expect(await prompt("advanced", true)).toContain("strong English");
    expect(await prompt("beginner", true)).toContain("very simple English");
  });

  it("asks for a gloss, not a wholesale translation", async () => {
    // The English is what the student is here to read; the Chinese unblocks
    // them. A fully translated reply would remove the lesson.
    expect(await prompt("beginner", true)).toContain("Do NOT translate the whole reply");
  });
});
