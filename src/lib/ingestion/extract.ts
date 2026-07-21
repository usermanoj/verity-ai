import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export type ExtractedPage = { pageOrSection: number; text: string };
export type ExtractedDocument = { pages: ExtractedPage[] };

// PPTX is deliberately not supported yet — no lightweight, well-maintained
// pure-JS PPTX text extractor was found that didn't pull in a heavy OCR
// dependency (officeparser bundles tesseract.js, which is too heavy for a
// serverless function). DOCX and PDF cover the two more tractable formats;
// see ROADMAP.md §7.
const SUPPORTED_EXTENSIONS = ["docx", "pdf"] as const;
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

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return { pages: text.map((t, i) => ({ pageOrSection: i + 1, text: t })) };
}
