/** One line of text read off an image: [word, the reader's confidence 0-100]. */
export type OcrLine = [string, number][];
export type OcrParagraph = OcrLine[];

/** Below this, a scrap is more likely a guess at artwork than real text. */
const UNSURE = 50;
/** A real line has at least one word the reader is sure of. */
const SURE = 80;

/**
 * The text of a screenshot without what the reader only guessed at. A
 * poster's artwork, logos, photos and QR codes come back as made-up words
 * ("mene, Ignites", "Rise", "Rao) Vo- Oreg)") that the reader itself gives
 * low confidence; real text, however small, scores far higher.
 *
 * - Lines with no word the reader is sure of go.
 * - Unsure scraps at either end of a line go: the edge of a picture or QR
 *   code beside the text ("…business attire rE a", "R2U0 MES UBM Take…").
 * - Unsure short scraps go anywhere: emoji and icons read as letters.
 */
export function confidentText(paragraphs: OcrParagraph[]): string {
  return paragraphs
    .map((lines) =>
      lines
        .map(confidentLine)
        .filter((line) => line !== "")
        .join("\n")
    )
    .filter(Boolean)
    .join("\n\n");
}

function confidentLine(line: OcrLine): string {
  const hasLink = line.some(([text]) => /https?:\/\/|www\.|@\w/.test(text));
  if (!hasLink && !line.some(([text, confidence]) => confidence >= SURE && text.replace(/[^\p{L}\p{N}]/gu, "").length >= 3)) return "";

  // A word that looks like one ("Coordinator") gets more benefit of the
  // doubt than a scrap ("R2U0", "TU)", "@c.").
  const wordy = (text: string) => /^[\p{L}][\p{L}'’-]{3,}[.,!?:;]?$/u.test(text);
  const scrap = ([text, confidence]: [string, number]) =>
    confidence < 35 || (confidence < UNSURE && !wordy(text)) || (confidence < 60 && text.replace(/[^\p{L}\p{N}]/gu, "").length <= 2 && text !== "&");

  // Short unsure bits anywhere: emoji and icons read as letters.
  let words = line.filter(([text, confidence]) => !((text.length <= 3 && confidence < 40) || (text.length <= 2 && confidence < UNSURE && text !== "&")));
  // Scraps at either end: the edge of a picture, logo or QR code beside the text.
  while (words.length > 0 && scrap(words[0])) words = words.slice(1);
  while (words.length > 0 && (scrap(words[words.length - 1]) || (!/[\p{L}\p{N}]/u.test(words[words.length - 1][0]) && words[words.length - 1][0] !== "&"))) {
    words = words.slice(0, -1);
  }
  // A word the reader all but made up, just before the end: what's after it
  // is the same picture ("…relevant field Canto Apply!", from "Scan to Apply!").
  const madeUp = words.findIndex(([, confidence], i) => confidence < 20 && i >= 3 && i >= words.length - 2);
  if (madeUp >= 0) words = words.slice(0, madeUp);
  return words.map(([text]) => text).join(" ");
}

/** Tesseract's result, as much of it as is used here. */
export interface OcrBlock {
  paragraphs: { lines: { words: { text: string; confidence: number }[]; bbox: { y0: number; y1: number } }[] }[];
}

/**
 * Tesseract's paragraphs, split again wherever a gap between two lines
 * shows a blank line it ran together ("…Government Affairs" ⏎⏎ "Ever
 * wondered…"): how a caption's first line stays apart from what follows.
 */
export function ocrParagraphs(blocks: OcrBlock[]): OcrParagraph[] {
  const out: OcrParagraph[] = [];
  for (const block of blocks) {
    for (const paragraph of block.paragraphs) {
      let current: OcrParagraph = [];
      paragraph.lines.forEach((line, i) => {
        const previous = paragraph.lines[i - 1];
        if (previous) {
          const height = Math.max(1, Math.min(previous.bbox.y1 - previous.bbox.y0, line.bbox.y1 - line.bbox.y0));
          if (line.bbox.y0 - previous.bbox.y1 > height * 0.9) {
            out.push(current);
            current = [];
          }
        }
        current.push(line.words.map((w): [string, number] => [w.text, Math.round(w.confidence)]));
      });
      out.push(current);
    }
  }
  return out.filter((p) => p.length > 0);
}

/**
 * Big lettering read off a small copy of the poster: the headline and the
 * date in giant type ("23rd October"), which the reader can't make out at
 * full size. Only lines it is sure of, and only what the full-size
 * reading doesn't already have.
 */
export function bigLettering(small: OcrParagraph[], fullText: string): string[] {
  const squash = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const have = squash(fullText);
  return small
    .flat()
    .filter((line) => line.length > 0 && line.every(([, c]) => c >= 85) && line.some(([t]) => t.replace(/[^\p{L}]/gu, "").length >= 3))
    .map((line) => line.map(([t]) => t).join(" "))
    .filter((line) => squash(line).length >= 4 && !have.includes(squash(line)));
}
