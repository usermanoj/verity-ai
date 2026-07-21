import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractDocument, isSupportedExtension } from "./extract";

// Minimal .pptx = a ZIP whose ppt/slides/slideN.xml carry the slide text in
// <a:t> runs. We only build the parts the extractor reads.
function slideXml(...paragraphs: string[][]): string {
  const body = paragraphs
    .map((runs) => `<a:p>${runs.map((r) => `<a:r><a:t>${r}</a:t></a:r>`).join("")}</a:p>`)
    .join("");
  return `<p:sld><p:cSld><p:spTree><p:sp><p:txBody>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
}

function pptxBuffer(slides: Record<string, string>): Buffer {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, xml] of Object.entries(slides)) entries[name] = strToU8(xml);
  return Buffer.from(zipSync(entries));
}

describe("isSupportedExtension", () => {
  it("accepts docx, pdf, pptx, txt (any case) and rejects others", () => {
    for (const ext of ["docx", "pdf", "pptx", "txt", "PPTX", "Txt"]) {
      expect(isSupportedExtension(ext)).toBe(true);
    }
    for (const ext of ["mp4", "ppt", "doc", "csv", ""]) {
      expect(isSupportedExtension(ext)).toBe(false);
    }
  });
});

describe("extractDocument — txt", () => {
  it("returns the raw text as a single section", async () => {
    const { pages } = await extractDocument(Buffer.from("A moment is a turning effect.\nMoment = F × d", "utf-8"), "txt");
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual({ pageOrSection: 1, text: "A moment is a turning effect.\nMoment = F × d" });
  });
});

describe("extractDocument — pptx", () => {
  it("extracts one section per slide, in slide order, joining runs and paragraphs", async () => {
    const buf = pptxBuffer({
      "ppt/slides/slide1.xml": slideXml(["What is a moment?"], ["Moment = force × distance"]),
      "ppt/slides/slide2.xml": slideXml(["The Principle of Moments"]),
    });
    const { pages } = await extractDocument(buf, "pptx");
    expect(pages).toEqual([
      { pageOrSection: 1, text: "What is a moment?\nMoment = force × distance" },
      { pageOrSection: 2, text: "The Principle of Moments" },
    ]);
  });

  it("orders slides numerically (slide10 after slide2), not lexically", async () => {
    const buf = pptxBuffer({
      "ppt/slides/slide1.xml": slideXml(["one"]),
      "ppt/slides/slide2.xml": slideXml(["two"]),
      "ppt/slides/slide10.xml": slideXml(["ten"]),
    });
    const { pages } = await extractDocument(buf, "pptx");
    expect(pages.map((p) => p.text)).toEqual(["one", "two", "ten"]);
  });

  it("skips text-less slides and decodes XML entities", async () => {
    const buf = pptxBuffer({
      "ppt/slides/slide1.xml": slideXml([]), // image-only / empty slide
      "ppt/slides/slide2.xml": slideXml(["Newton &amp; force &lt; 10 N"]),
    });
    const { pages } = await extractDocument(buf, "pptx");
    expect(pages).toEqual([{ pageOrSection: 1, text: "Newton & force < 10 N" }]);
  });
});
