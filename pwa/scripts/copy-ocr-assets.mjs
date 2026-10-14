// Copies the on-device text-recognition engine (Tesseract.js) and its
// English model into public/ocr, so they're served by our own site rather
// than a third-party CDN (src/ocr.ts). Runs before dev/build; the copies
// are git-ignored. Only the LSTM engine variants Tesseract.js actually
// loads for OEM 1 are copied (SIMD and non-SIMD), plus the compact
// "best_int" English model.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "public/ocr");
mkdirSync(out, { recursive: true });

const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "eng.traineddata.gz"],
];
for (const [from, to] of files) copyFileSync(resolve(root, from), resolve(out, to));
console.log(`OCR assets copied to public/ocr (${files.length} files)`);
