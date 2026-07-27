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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("render timed out")), ms)),
  ]);
}

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
  let stillRendering = true;

  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  for (let n = 1; n <= pageCount; n++) {
    const text = textByPage[n - 1] ?? "";

    // Page numbering follows text-bearing pages, matching how .pptx pages are
    // numbered — an image is only useful on the same page number as the text
    // it illustrates.
    if (!text.trim()) continue;
    pages.push({ pageOrSection: pages.length + 1, text });

    if (stillRendering) {
      const image = await renderPage(pdf, n, pages.length);
      if (image) {
        rendered.push(image);
      } else {
        // The first failure stops the rest. Rendering fails for one reason in
        // practice — the tab is in the background, so rAF never fires — and
        // that reason applies to every remaining page. Trying them all anyway
        // would spend forty timeouts, thirteen minutes, to learn the same
        // thing. The text is already extracted, so the upload continues and
        // simply arrives without pictures of the slides.
        stillRendering = false;
      }
    }
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

    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);

    // OffscreenCanvas where available: no DOM node to attach, detach and
    // garbage-collect forty times over.
    //
    // It does NOT solve the hidden-tab problem, which is worth stating
    // plainly because it looks like it should. pdf.js schedules its rendering
    // continuations with requestAnimationFrame whenever `window` exists,
    // regardless of canvas type, and rAF does not fire in a backgrounded tab.
    // Measured directly: with document.hidden true, rAF never fires and
    // page.render() never resolves, while extractText on the same document
    // returns normally. The timeout below is what actually handles it.
    const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : document.createElement("canvas");
    if (!(canvas instanceof OffscreenCanvas)) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext("2d") as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!context) return null;

    // Slides are designed on white. Without this the transparent areas of the
    // page render black, and a JPEG cannot carry transparency anyway.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    // A per-page ceiling regardless: one pathological page should cost its own
    // picture, not the teacher's upload.
    await withTimeout(
      page.render({ canvas, canvasContext: context, viewport } as Parameters<typeof page.render>[0]).promise,
      20_000,
    );

    // JPEG, not PNG: a rendered slide is a photograph-like image where PNG's
    // lossless encoding costs several times the bytes for no visible gain.
    const blob =
      canvas instanceof OffscreenCanvas
        ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 })
        : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));

    return blob ? { pageOrSection, blob, width, height } : null;
  } catch {
    // One unrenderable page costs its own picture, not the upload.
    return null;
  }
}
