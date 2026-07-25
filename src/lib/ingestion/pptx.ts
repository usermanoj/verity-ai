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

// One page per slide, in slide order, skipping slides with no text (title
// dividers, image-only slides). Matches the "page/section" citation model.
export function extractPptxPages(bytes: Uint8Array): ExtractedPage[] {
  const files = unzipSync(bytes);
  const slideNames = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const pages: ExtractedPage[] = [];
  let pageNo = 0;
  for (const name of slideNames) {
    const text = pptSlideText(strFromU8(files[name]));
    if (text.trim()) {
      pageNo += 1;
      pages.push({ pageOrSection: pageNo, text });
    }
  }
  return pages;
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
    const runs = [...para.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXmlEntities(m[1]));
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
