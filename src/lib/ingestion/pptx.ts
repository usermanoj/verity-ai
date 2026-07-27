import { unzipSync, strFromU8 } from "fflate";

export type ExtractedPage = { pageOrSection: number; text: string };

// Isolated from extract.ts so it can run in the BROWSER as well as on the
// server. extract.ts pulls in mammoth and unpdf (Node-only and heavy); this
// module's only dependency is fflate, which is tiny and isomorphic.
//
// The browser already holds the file the teacher picked, so extracting there
// means the server never has to download it back out of Storage — measured
// at 3023ms of a 7107ms upload for a 15.8 MB deck, most of it that transfer.
// It also removes a real cost at scale: today every upload pulls its whole
// file into a serverless function's memory.

// A diagram lifted straight out of the deck, tied to the slide it came from.
//
// These beat anything we could synthesise: a teacher drew or chose them, they
// match what students saw in class, and they carry no invention risk at all.
// We were unzipping the file, taking the text, and discarding every image.
export type ExtractedMedia = {
  pageOrSection: number;
  /** Path inside the .pptx, e.g. "ppt/media/image7.png". Used for dedup. */
  sourcePath: string;
  extension: string;
  bytes: Uint8Array;
  width: number;
  height: number;
};

// One page per slide, in slide order, skipping slides with no text (title
// dividers, image-only slides). Matches the "page/section" citation model.
export function extractPptxPages(bytes: Uint8Array): ExtractedPage[] {
  return extractPptx(bytes).pages;
}

// Pages and diagrams share one pass, because they must share one numbering:
// an image is only useful if it lands on the same page number as the text it
// illustrates, and pages are numbered by *text-bearing* slides, not by slide
// index.
export function extractPptx(bytes: Uint8Array): { pages: ExtractedPage[]; media: ExtractedMedia[] } {
  const files = unzipSync(bytes);
  const slideNames = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const pages: ExtractedPage[] = [];
  const candidates: ExtractedMedia[] = [];
  let pageNo = 0;
  // Images from slides that have no text of their own, waiting for a page to
  // belong to. See the carry-forward note below.
  let orphans: Omit<ExtractedMedia, "pageOrSection">[] = [];

  for (const name of slideNames) {
    const xml = strFromU8(files[name]);
    const text = pptSlideText(xml);
    const slideMedia = readSlideMedia(files, name, xml);

    // A slide with no text produces no page — but it very often produces the
    // best picture in the deck. Measured on a real 44-slide physics deck: 10
    // of its 30 diagrams sat on text-less slides, a third of the visuals
    // thrown away by treating "no text" as "nothing here".
    //
    // A wordless slide is almost always a diagram for the point just made, so
    // its images join the previous page. Before any page exists they wait for
    // the first one, which covers a deck that opens on a title image.
    if (!text.trim()) {
      if (pageNo > 0) {
        for (const m of slideMedia) candidates.push({ ...m, pageOrSection: pageNo });
      } else {
        orphans = orphans.concat(slideMedia);
      }
      continue;
    }

    pageNo += 1;
    pages.push({ pageOrSection: pageNo, text });

    for (const m of orphans) candidates.push({ ...m, pageOrSection: pageNo });
    orphans = [];

    for (const m of slideMedia) candidates.push({ ...m, pageOrSection: pageNo });
  }

  return { pages, media: usefulMedia(candidates, pages.length) };
}

function readSlideMedia(
  files: Record<string, Uint8Array>,
  name: string,
  xml: string,
): Omit<ExtractedMedia, "pageOrSection">[] {
  const out: Omit<ExtractedMedia, "pageOrSection">[] = [];
  for (const path of slideMediaPaths(files, name, xml)) {
    const data = files[path];
    if (!data) continue;
    const extension = path.split(".").pop()?.toLowerCase() ?? "";
    if (!RENDERABLE.has(extension)) continue;
    const size = imageSize(data, extension);
    if (!size) continue;
    out.push({ sourcePath: path, extension, bytes: data, width: size.width, height: size.height });
  }
  return out;
}

// EMF/WMF are common in decks pasted from Office but no browser renders them,
// and SVG from an untrusted upload can carry script.
const RENDERABLE = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

// Separates teaching diagrams from page furniture. A deck's logo, header rule
// and bullet glyphs are images too, and shipping them would bury the real
// diagrams in noise.
function usefulMedia(candidates: ExtractedMedia[], pageCount: number): ExtractedMedia[] {
  const appearances = new Map<string, number>();
  for (const m of candidates) appearances.set(m.sourcePath, (appearances.get(m.sourcePath) ?? 0) + 1);

  const kept = candidates.filter((m) => {
    // Repeated on a third or more of the deck: that's a template element, not
    // a diagram about this slide's concept.
    if (pageCount >= 6 && (appearances.get(m.sourcePath) ?? 0) >= Math.ceil(pageCount / 3)) return false;
    // Too small to teach with — icons, bullets, spacer pixels.
    if (m.width < 120 || m.height < 90) return false;
    // Banners and rules: no diagram is fifteen times wider than it is tall.
    const ratio = m.width / m.height;
    if (ratio > 6 || ratio < 1 / 6) return false;
    // Line-art diagrams compress extremely well — a clean 300×300 PNG of a
    // field sketch can be 5 kB. The dimension check above already excludes
    // decoration, so this floor only needs to catch degenerate files.
    if (m.bytes.byteLength < 2 * 1024) return false;
    return true;
  });

  // Bound per page and per deck: a busy slide can hold a dozen fragments, and
  // every image kept is bytes stored, transferred and paid for. The per-page
  // allowance is generous because a page now inherits the diagrams from any
  // wordless slides around it.
  const perPage = new Map<number, number>();
  const bounded: ExtractedMedia[] = [];
  for (const m of kept) {
    const used = perPage.get(m.pageOrSection) ?? 0;
    if (used >= 4) continue;
    perPage.set(m.pageOrSection, used + 1);
    bounded.push(m);
    if (bounded.length >= 60) break;
  }
  return bounded;
}

// <a:blip r:embed="rId3"/> names a relationship, not a file; the mapping to
// ppt/media/* lives in the slide's own _rels sidecar.
function slideMediaPaths(files: Record<string, Uint8Array>, slideName: string, xml: string): string[] {
  const relsName = slideName.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels");
  const relsFile = files[relsName];
  if (!relsFile) return [];
  const rels = strFromU8(relsFile);

  const targetById = new Map<string, string>();
  for (const m of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    if (!/media\//i.test(m[2])) continue;
    // Targets are relative to ppt/slides/, e.g. "../media/image3.png".
    targetById.set(m[1], `ppt/${m[2].replace(/^\.\.\//, "")}`);
  }

  const paths: string[] = [];
  for (const m of xml.matchAll(/r:embed="([^"]+)"/g)) {
    const target = targetById.get(m[1]);
    if (target) paths.push(target);
  }
  return paths;
}

// Dimensions straight from the file header — enough to tell a diagram from a
// bullet without decoding the image.
function imageSize(data: Uint8Array, extension: string): { width: number; height: number } | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  try {
    if (extension === "png" && data.byteLength > 24) {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (extension === "gif" && data.byteLength > 10) {
      return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    }
    if (extension === "jpg" || extension === "jpeg") {
      let offset = 2;
      while (offset + 9 < data.byteLength) {
        if (data[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = data[offset + 1];
        // SOF0-SOF15, excluding the non-frame markers in that range.
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
        }
        offset += 2 + view.getUint16(offset + 2);
      }
      return null;
    }
    // WebP dimensions vary by chunk type; accept it and let the browser size it.
    if (extension === "webp") return { width: 640, height: 480 };
  } catch {
    return null;
  }
  return null;
}

function slideNumber(name: string): number {
  const m = name.match(/slide(\d+)\.xml$/);
  return m ? parseInt(m[1], 10) : 0;
}

// Slide text lives in <a:t>…</a:t> runs, grouped into <a:p> paragraphs.
// Join runs within a paragraph, paragraphs onto their own lines.
function pptSlideText(xml: string): string {
  // Strip slide-number placeholders first. PowerPoint stores them as
  // <a:fld type="slidenum"> containing an ordinary <a:t> run, so they were
  // being collected as slide content — polluting the text ("2 The turning
  // effect of a force is called a moment…") and, when the placeholder sat at
  // the top of the layout, becoming the chunk's heading (headings literally
  // read "2" and "3" instead of the slide title).
  const body = xml.replace(/<a:fld\b[^>]*\btype="slidenum"[^>]*>[\s\S]*?<\/a:fld>/g, "");

  const lines: string[] = [];
  for (const para of body.split("</a:p>")) {
    // <a:t> carries attributes more often than it looks — PowerPoint emits
    // xml:space="preserve" on any run whose text has meaningful leading or
    // trailing whitespace, which is most runs that continue a word or phrase
    // started by the previous one. Matching only the bare tag dropped those
    // runs silently, so a slide reading "Scrap yard Electromagnets" reached
    // students as "Scrap yard Electro" — text vanished mid-word with nothing
    // to indicate anything was missing.
    const runs = [...para.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
    const line = runs.join("").trim();
    if (line) lines.push(line);
  }
  return lines.join("\n");
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
