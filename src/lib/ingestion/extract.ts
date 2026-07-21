import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { unzipSync, strFromU8 } from "fflate";

export type ExtractedPage = { pageOrSection: number; text: string };
export type ExtractedDocument = { pages: ExtractedPage[] };

// PPTX support uses a *lightweight* path: a .pptx is a ZIP of XML, so we
// unzip (fflate, tiny) and pull the text runs out of each slide's XML — no
// OCR engine. This is why officeparser was rejected earlier (it bundles
// tesseract.js, too heavy for a serverless function); that reasoning holds,
// but it doesn't apply to plain text extraction, which is all we need.
const SUPPORTED_EXTENSIONS = ["docx", "pdf", "txt", "pptx"] as const;
export type SupportedExtension = (typeof SUPPORTED_EXTENSIONS)[number];

export function isSupportedExtension(ext: string): ext is SupportedExtension {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}

export async function extractDocument(buffer: Buffer, extension: SupportedExtension): Promise<ExtractedDocument> {
  if (extension === "docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    // DOCX has no natural "page" concept — treat the whole document as one section.
    return { pages: [{ pageOrSection: 1, text: value }] };
  }

  if (extension === "txt") {
    return { pages: [{ pageOrSection: 1, text: buffer.toString("utf-8") }] };
  }

  if (extension === "pptx") {
    return { pages: extractPptx(buffer) };
  }

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return { pages: text.map((t, i) => ({ pageOrSection: i + 1, text: t })) };
}

// One page per slide, in slide order, skipping slides with no text (title
// dividers, image-only slides). Matches the "page/section" citation model.
function extractPptx(buffer: Buffer): ExtractedPage[] {
  const files = unzipSync(new Uint8Array(buffer));
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
  const lines: string[] = [];
  for (const para of xml.split("</a:p>")) {
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
