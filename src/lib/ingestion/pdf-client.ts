import type { ExtractedPage } from "./extract";

// Reads a PDF in the BROWSER: text per page, plus a picture of each page.
//
// This exists for the diagrams that unzipping a .pptx can never reach.
// PowerPoint draws a lot of its figures with native vector shapes rather than
// embedded images — two slides in the Grade 7 magnetism deck are built that
// way — and those are instructions, not files, so there is nothing to pull
// out of the archive. Rendering the page is the only way to see them.
//
// Why in the browser, when a server could do it more easily:
//
// A school's teaching material should not travel anywhere new to be
// converted. Server-side rasterisation means either running LibreOffice on
// infrastructure we'd have to operate, or posting the file to a conversion
// vendor — and "we don't send your material anywhere" is worth more to a
// school than the few percent of fidelity either would buy. The teacher's own
// machine already holds the file, already has a PDF engine, and is already
// where .pptx parsing happens for exactly the same reason.
//
// The teacher exports their deck as PDF (one menu item in PowerPoint) and
// uploads that; nothing else about the flow changes.

export type RenderedPage = {
  pageOrSection: number;
  blob: Blob;
  width: number;
  height: number;
};

// Slides are 4:3 or 16:9 and read at a glance, so a long edge around 1400px
// is the point past which a bigger file stops buying legibility.
const TARGET_LONG_EDGE = 1400;

// A bound on work and on bytes: a teacher on a school connection uploads
// these, and every page kept is storage paid for every month afterwards.
const MAX_PAGES = 40;

export async function extractPdfInBrowser(
  data: Uint8Array,
): Promise<{ pages: ExtractedPage[]; rendered: RenderedPage[] }> {
  const { getDocumentProxy, extractText } = await import("unpdf");

  // getDocumentProxy transfers the buffer, and rendering needs to read it
  // again afterwards — passing the same one twice yields an empty document.
  const pdf = await getDocumentProxy(new Uint8Array(data));

  // Text for the whole document in one pass. Called per page it re-extracts
  // every page each time, which is quadratic on a long deck.
  const extracted = await extractText(pdf, { mergePages: false });
  const textByPage = Array.isArray(extracted.text) ? extracted.text : [extracted.text];

  const pages: ExtractedPage[] = [];
  const rendered: RenderedPage[] = [];

  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  for (let n = 1; n <= pageCount; n++) {
    const text = textByPage[n - 1] ?? "";

    // Page numbering follows text-bearing pages, matching how .pptx pages are
    // numbered — an image is only useful on the same page number as the text
    // it illustrates.
    if (!text.trim()) continue;
    pages.push({ pageOrSection: pages.length + 1, text });

    const image = await renderPage(pdf, n, pages.length);
    if (image) rendered.push(image);
  }

  return { pages, rendered };
}

async function renderPage(
  pdf: Awaited<ReturnType<typeof import("unpdf").getDocumentProxy>>,
  pageNumber: number,
  pageOrSection: number,
): Promise<RenderedPage | null> {
  try {
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = TARGET_LONG_EDGE / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale: Math.min(scale, 3) });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) return null;

    // Slides are designed on white. Without this the transparent areas of the
    // page render black, and a JPEG cannot carry transparency anyway.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, canvasContext: context, viewport }).promise;

    // JPEG, not PNG: a rendered slide is a photograph-like image where PNG's
    // lossless encoding costs several times the bytes for no visible gain.
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    // Free the backing store immediately — forty slide-sized canvases held at
    // once is enough to be noticed on an iPad.
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return null;

    return { pageOrSection, blob, width: canvas.width || Math.round(viewport.width), height: Math.round(viewport.height) };
  } catch {
    // One unrenderable page costs its own picture, not the upload.
    return null;
  }
}
