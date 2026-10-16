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

/**
 * The reading engine can fail without a message of its own (it throws a
 * bare number, such as 0), most often when a phone runs short of memory.
 */
export class ReaderCrashedError extends Error {
  constructor(code: unknown) {
    super(
      `the text reader stopped unexpectedly (code ${String(code)}). This often happens when the phone is short of memory: close other apps and try again`
    );
    this.name = "ReaderCrashedError";
  }
}

/** A thrown value as an Error: the engine's own message, or a crash. */
function asError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : typeof thrown === "string" && thrown.trim() ? new Error(thrown) : new ReaderCrashedError(thrown);
}

/** Bigger than this (longest side, in pixels) only costs memory: phone photos are shrunk first. */
const MAX_SIDE = 2400;

export async function readTextFromImage(file: Blob, onProgress?: (fraction: number) => void): Promise<ImageText> {
  const { createWorker } = await import("tesseract.js");
  const base = new URL("/ocr/", window.location.origin).href;
  let pass = 0;
  const startWorker = () =>
    createWorker("eng", 1, {
      workerPath: `${base}worker.min.js`,
      corePath: base,
      langPath: base.replace(/\/$/, ""),
      logger: (m: { status: string; progress: number }) => {
        // The second, small pass is quick: the bar covers the first 90%.
        if (m.status === "recognizing text") onProgress?.(pass === 0 ? m.progress * 0.9 : 0.9 + m.progress * 0.1);
      },
    });

  const image = await shrunk(file);
  let worker = await startWorker().catch((e) => {
    throw asError(e);
  });
  try {
    let text: string;
    let detailed = true;
    try {
      const full = await worker.recognize(image, {}, { text: true, blocks: true });
      text = full.data.text;
      try {
        if (full.data.blocks) text = confidentText(ocrParagraphs(full.data.blocks));
      } catch {
        // Keep the plain reading.
      }
    } catch {
      // The detailed reading needs the most memory. Once more, the plain
      // way, with a fresh reader (the old one may not have survived).
      detailed = false;
      await worker.terminate().catch(() => undefined);
      worker = await startWorker().catch((e) => {
        throw asError(e);
      });
      try {
        text = (await worker.recognize(image)).data.text;
      } catch (e) {
        throw asError(e);
      }
    }

    // The extra pass for giant lettering is a bonus: if it fails, or the
    // phone already struggled, the main reading still counts.
    pass = 1;
    let lettering: string[] = [];
    if (detailed) {
      try {
        const small = await smallPoster(file);
        if (small) {
          const { data } = await worker.recognize(small, {}, { blocks: true });
          if (data.blocks) lettering = bigLettering(ocrParagraphs(data.blocks), text);
        }
      } catch {
        lettering = [];
      }
    }
    return { text, lettering };
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}

/** The image itself, or a smaller copy if it's larger than reading needs. */
async function shrunk(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = MAX_SIDE / Math.max(bitmap.width, bitmap.height);
    if (scale >= 1) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return (await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92))) ?? file;
  } catch {
    return file;
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
