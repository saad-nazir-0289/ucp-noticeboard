import { cropToPoster } from "@shared/posterCrop";
import { bigLettering, confidentText, ocrParagraphs } from "./ocrText";

/**
 * Reads the text out of an image (a screenshot of an Instagram post, a
 * photo of a printed poster…) on the device itself — free, nothing is
 * uploaded for it. Tesseract.js is loaded only when first used, so it
 * costs students nothing on a normal visit. Its engine and English model
 * (~7 MB, cached after first use) are served from our own site — copied
 * into public/ocr by scripts/copy-ocr-assets.mjs — not a third-party CDN.
 */
export interface ImageText {
  /** Everything the reader is sure of, at full size. */
  text: string;
  /** Giant lettering only a small copy gives up (see bigLettering). */
  lettering: string[];
}

export async function readTextFromImage(file: Blob, onProgress?: (fraction: number) => void): Promise<ImageText> {
  const { createWorker } = await import("tesseract.js");
  const base = new URL("/ocr/", window.location.origin).href;
  let pass = 0;
  const worker = await createWorker("eng", 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base.replace(/\/$/, ""),
    logger: (m: { status: string; progress: number }) => {
      // The second, small pass is quick: the bar covers the first 90%.
      if (m.status === "recognizing text") onProgress?.(pass === 0 ? m.progress * 0.9 : 0.9 + m.progress * 0.1);
    },
  });
  try {
    const full = await worker.recognize(file, {}, { text: true, blocks: true });
    let text = full.data.text;
    try {
      if (full.data.blocks) text = confidentText(ocrParagraphs(full.data.blocks));
    } catch {
      // Keep the plain reading.
    }
    // The extra pass for giant lettering is a bonus: if it fails (a phone
    // short of memory), the main reading still counts.
    pass = 1;
    let lettering: string[] = [];
    try {
      const small = await smallPoster(file);
      if (small) {
        const { data } = await worker.recognize(small, {}, { blocks: true });
        if (data.blocks) lettering = bigLettering(ocrParagraphs(data.blocks), text);
      }
    } catch {
      lettering = [];
    }
    return { text, lettering };
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

/** The poster (cropped out of a screenshot when it is one), about 300 pixels wide. */
async function smallPoster(file: Blob): Promise<Blob | null> {
  try {
    const poster = (await cropToPoster(file)) ?? file;
    const bitmap = await createImageBitmap(poster);
    const width = 300;
    if (bitmap.width < width * 1.5) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round((bitmap.height / bitmap.width) * width);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch {
    return null;
  }
}
