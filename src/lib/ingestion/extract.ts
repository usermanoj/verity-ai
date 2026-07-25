import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { extractPptxPages, type ExtractedPage } from "./pptx";

export type { ExtractedPage };
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
    return { pages: extractPptxPages(new Uint8Array(buffer)) };
  }

  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: false });
  return { pages: text.map((t, i) => ({ pageOrSection: i + 1, text: t })) };
}
