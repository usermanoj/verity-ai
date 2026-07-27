import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractDocument, isSupportedExtension } from "./extract";
import { extractPptx } from "./pptx";

// A minimal but valid PNG header: the extractor reads width/height straight
// from bytes 16-23 to tell a diagram from a bullet glyph, then pads to a
// believable file size so the "too small to teach with" filter doesn't bite.
function pngBytes(width: number, height: number, totalBytes = 20 * 1024): Uint8Array {
  const png = new Uint8Array(totalBytes);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(png.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return png;
}

function slideWithImage(text: string, relId: string): string {
  return (
    `<p:sld><p:cSld><p:spTree><p:sp><p:txBody>` +
    `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>` +
    `</p:txBody></p:sp><p:pic><p:blipFill><a:blip r:embed="${relId}"/></p:blipFill></p:pic>` +
    `</p:spTree></p:cSld></p:sld>`
  );
}

function relsFor(entries: [string, string][]): string {
  return (
    `<Relationships>` +
    entries.map(([id, target]) => `<Relationship Id="${id}" Target="${target}"/>`).join("") +
    `</Relationships>`
  );
}

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

// A deck's own diagrams beat anything generated, so extracting them matters —
// but so does NOT extracting the logo that sits on every slide.
describe("extractPptx — diagrams", () => {
  it("pairs an image with the page number of the slide it came from", () => {
    const zip = zipSync({
      "ppt/slides/slide1.xml": strToU8(slideWithImage("Field around a bar magnet", "rId2")),
      "ppt/slides/_rels/slide1.xml.rels": strToU8(relsFor([["rId2", "../media/image1.png"]])),
      "ppt/media/image1.png": pngBytes(600, 400),
    });
    const { media } = extractPptx(new Uint8Array(zip));
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ pageOrSection: 1, width: 600, height: 400, extension: "png" });
  });

  it("numbers images by text-bearing page, not by slide index", () => {
    // Slide 1 has no text, so it becomes no page — the image on slide 2 must
    // be page 1, matching how its chunk will be cited.
    const zip = zipSync({
      "ppt/slides/slide1.xml": strToU8("<p:sld><p:cSld><p:spTree/></p:cSld></p:sld>"),
      "ppt/slides/slide2.xml": strToU8(slideWithImage("Domains", "rId2")),
      "ppt/slides/_rels/slide2.xml.rels": strToU8(relsFor([["rId2", "../media/image1.png"]])),
      "ppt/media/image1.png": pngBytes(500, 400),
    });
    const { pages, media } = extractPptx(new Uint8Array(zip));
    expect(pages[0].pageOrSection).toBe(1);
    expect(media[0].pageOrSection).toBe(1);
  });

  it("drops the logo that repeats across the deck", () => {
    const files: Record<string, Uint8Array> = { "ppt/media/logo.png": pngBytes(400, 300) };
    for (let i = 1; i <= 9; i++) {
      files[`ppt/slides/slide${i}.xml`] = strToU8(slideWithImage(`Slide ${i} content`, "rId2"));
      files[`ppt/slides/_rels/slide${i}.xml.rels`] = strToU8(relsFor([["rId2", "../media/logo.png"]]));
    }
    const { media } = extractPptx(new Uint8Array(zipSync(files)));
    expect(media).toHaveLength(0);
  });

  it("drops icons, banners and formats no browser renders", () => {
    const zip = zipSync({
      "ppt/slides/slide1.xml": strToU8(slideWithImage("Icons", "rId2")),
      "ppt/slides/_rels/slide1.xml.rels": strToU8(relsFor([["rId2", "../media/icon.png"]])),
      "ppt/media/icon.png": pngBytes(40, 40),
      "ppt/slides/slide2.xml": strToU8(slideWithImage("Banner", "rId2")),
      "ppt/slides/_rels/slide2.xml.rels": strToU8(relsFor([["rId2", "../media/rule.png"]])),
      "ppt/media/rule.png": pngBytes(1200, 40),
      "ppt/slides/slide3.xml": strToU8(slideWithImage("Pasted from Word", "rId2")),
      "ppt/slides/_rels/slide3.xml.rels": strToU8(relsFor([["rId2", "../media/image2.emf"]])),
      "ppt/media/image2.emf": pngBytes(600, 400),
    });
    expect(extractPptx(new Uint8Array(zip)).media).toHaveLength(0);
  });
});

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

  it("drops slide-number placeholders so they can't pollute text or headings", async () => {
    // PowerPoint stores the slide number as <a:fld type="slidenum"> holding a
    // normal <a:t> run. Collecting it made chunk headings read "2"/"3" and
    // prefixed the body text with the number.
    const xml =
      `<p:sld><p:cSld><p:spTree><p:sp><p:txBody>` +
      `<a:p><a:fld id="{X}" type="slidenum"><a:t>2</a:t></a:fld></a:p>` +
      `<a:p><a:r><a:t>Definition of a moment</a:t></a:r></a:p>` +
      `<a:p><a:r><a:t>The turning effect of a force.</a:t></a:r></a:p>` +
      `</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
    const { pages } = await extractDocument(pptxBuffer({ "ppt/slides/slide1.xml": xml }), "pptx");
    expect(pages).toHaveLength(1);
    expect(pages[0].text).toBe("Definition of a moment\nThe turning effect of a force.");
    expect(pages[0].text).not.toMatch(/^2/);
  });

  it("keeps runs carrying attributes, so text cannot vanish mid-word", async () => {
    // PowerPoint puts xml:space="preserve" on any run whose text has
    // meaningful leading/trailing whitespace — i.e. most runs continuing a
    // phrase. Matching only the bare <a:t> dropped them silently, turning
    // "Scrap yard Electromagnets" into "Scrap yard Electro" on the page.
    const xml =
      `<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p>` +
      `<a:r><a:t>Scrap yard </a:t></a:r>` +
      `<a:r><a:t xml:space="preserve">Electro</a:t></a:r>` +
      `<a:r><a:t xml:space="preserve">magnets</a:t></a:r>` +
      `</a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
    const { pages } = await extractDocument(pptxBuffer({ "ppt/slides/slide1.xml": xml }), "pptx");
    expect(pages[0].text).toBe("Scrap yard Electromagnets");
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
