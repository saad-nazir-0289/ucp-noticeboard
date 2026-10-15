/** One line of text read off an image: [word, the reader's confidence 0-100]. */
export type OcrLine = [string, number][];
export type OcrParagraph = OcrLine[];

/** Below this, a word is more likely a guess at artwork than real text. */
const UNSURE = 45;
/** A real line has at least one word the reader is sure of. */
const SURE = 80;

/**
 * The text of a screenshot without what the reader only guessed at. A
 * poster's artwork, logos, photos and QR codes come back as made-up words
 * ("mene, Ignites", "Rise", "Rao) Vo- Oreg)") that the reader itself gives
 * low confidence; real text, however small, scores far higher.
 *
 * - Lines with no word the reader is sure of go.
 * - Unsure scraps at the end of a line go: the edge of a picture or QR code
 *   beside the text ("…business attire rE a").
 * - Unsure one- and two-letter scraps go anywhere: emoji read as letters.
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

  let words = line.filter(([text, confidence]) => !(confidence < UNSURE && text.length <= 2));
  // Unsure words (and stray symbols) at the end of the line.
  while (words.length > 0) {
    const [text, confidence] = words[words.length - 1];
    if (confidence < UNSURE || !/[\p{L}\p{N}]/u.test(text) || (text.length === 1 && confidence < 60)) words = words.slice(0, -1);
    else break;
  }
  // A word the reader all but made up, just before the end: what's after it
  // is the same picture ("…relevant field Canto Apply!", from "Scan to Apply!").
  const madeUp = words.findIndex(([, confidence], i) => confidence < 20 && i >= 3 && i >= words.length - 2);
  if (madeUp >= 0) words = words.slice(0, madeUp);
  return words.map(([text]) => text).join(" ");
}
