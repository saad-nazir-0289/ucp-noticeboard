/**
 * Reads the text out of an image (a screenshot of an Instagram post, a
 * photo of a printed poster…) on the device itself — free, nothing is
 * uploaded for it. Tesseract.js is loaded only when first used, so it
 * costs students nothing on a normal visit. Its engine and English model
 * (~7 MB, cached after first use) are served from our own site — copied
 * into public/ocr by scripts/copy-ocr-assets.mjs — not a third-party CDN.
 */
export async function readTextFromImage(file: Blob, onProgress?: (fraction: number) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const base = new URL("/ocr/", window.location.origin).href;
  const worker = await createWorker("eng", 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base.replace(/\/$/, ""),
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
