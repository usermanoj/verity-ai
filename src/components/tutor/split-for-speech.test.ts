import { describe, expect, it } from "vitest";
import { splitForSpeech } from "./AiTutorPanel";

describe("splitForSpeech", () => {
  it("keeps a short reply as a single utterance", () => {
    expect(splitForSpeech("A magnet has two poles.")).toEqual([
      { text: "A magnet has two poles.", lang: "en-US" },
    ]);
  });

  it("separates Chinese from English so each gets the right voice", () => {
    const out = splitForSpeech("The iron core 铁芯 makes it stronger.");
    expect(out.map((s) => s.lang)).toEqual(["en-US", "zh-CN", "en-US"]);
  });

  it("breaks long text into utterances short enough to dodge Chrome's cut-off", () => {
    // The ~15s limit is what the pause/resume hack existed for; staying under
    // it by construction is what let the hack — and its replay bug — go.
    const long = "An electromagnet is made by passing current through a coil of wire. ".repeat(12);
    const out = splitForSpeech(long);
    expect(out.length).toBeGreaterThan(1);
    for (const seg of out) expect(seg.text.length).toBeLessThanOrEqual(200);
  });

  it("breaks on full-width stops, not just ASCII ones", () => {
    const long = "铁芯使磁场更强。".repeat(40);
    const out = splitForSpeech(long);
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((s) => s.lang === "zh-CN")).toBe(true);
  });

  it("loses no text when splitting", () => {
    const long = "Iron becomes magnetised inside the coil. ".repeat(10);
    const rejoined = splitForSpeech(long).map((s) => s.text).join("");
    expect(rejoined.replace(/\s+/g, " ").trim()).toBe(long.replace(/\s+/g, " ").trim());
  });
});
