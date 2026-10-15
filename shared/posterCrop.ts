/**
 * A phone screenshot of a post (Instagram, WhatsApp, a website) cropped to
 * the poster itself: the post is a block of picture rows that run edge to
 * edge, between the app's own bars, which are one flat colour at the
 * screen's edges. Done in the browser on a small copy, so it's quick and
 * nothing is uploaded for it. Returns null when it isn't clearly such a
 * screenshot (an ordinary photo or poster), so the image is left as it is.
 */
export async function cropToPoster(file: Blob): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const { width, height } = bitmap;
  // Phone screenshots are tall; anything else is taken as the poster itself.
  if (height / width < 1.6) return null;

  const box = findPosterBox(bitmap);
  if (!box) return null;

  const canvas = document.createElement("canvas");
  canvas.width = box.right - box.left;
  canvas.height = box.bottom - box.top;
  canvas.getContext("2d")!.drawImage(bitmap, box.left, box.top, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92));
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function findPosterBox(bitmap: ImageBitmap): Box | null {
  const w = 160;
  const h = Math.round((bitmap.height / bitmap.width) * w);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const at = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  const differs = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 48;

  // The app's background: the colour down the screen's left edge, most of the time.
  const counts = new Map<string, { n: number; c: number[] }>();
  for (let y = 0; y < h; y++) {
    const c = at(1, y);
    const key = c.map((v) => v >> 4).join(",");
    const entry = counts.get(key) ?? { n: 0, c };
    entry.n++;
    counts.set(key, entry);
  }
  const background = [...counts.values()].sort((a, b) => b.n - a.n)[0];
  // No clear app background (a tall poster, a photo): leave it alone.
  if (!background || background.n < h * 0.3) return null;
  const bg = background.c;

  // A picture row: busy across the width, edge to edge.
  const isPictureRow = (y: number) => {
    let busy = 0;
    for (let x = 0; x < w; x += 2) if (differs(at(x, y), bg)) busy++;
    return busy / (w / 2) > 0.55 && (differs(at(1, y), bg) || differs(at(w - 2, y), bg));
  };

  // The longest run of picture rows, allowing small gaps (white space in the poster).
  const gap = Math.max(2, Math.round(h * 0.012));
  let best: [number, number] | null = null;
  let start = -1;
  let last = -1;
  for (let y = 0; y <= h; y++) {
    if (y < h && isPictureRow(y)) {
      if (start < 0) start = y;
      last = y;
    } else if (start >= 0 && (y === h || y - last > gap)) {
      if (!best || last - start > best[1] - best[0]) best = [start, last];
      start = -1;
    }
  }
  if (!best) return null;
  const runHeight = best[1] - best[0] + 1;
  // Too small to be the post, or practically the whole screen (nothing to crop).
  if (runHeight < h * 0.18 || runHeight < w * 0.4 || runHeight > h * 0.92) return null;

  const scale = bitmap.width / w;
  return {
    left: 0,
    right: bitmap.width,
    top: Math.max(0, Math.floor(best[0] * scale)),
    bottom: Math.min(bitmap.height, Math.ceil((best[1] + 1) * scale)),
  };
}

/** The file to use as a poster: cropped from a screenshot when one is recognised, otherwise the file itself. */
export async function posterFrom(file: File): Promise<{ poster: File; cropped: boolean }> {
  const blob = await cropToPoster(file);
  return blob ? { poster: new File([blob], "poster.jpg", { type: "image/jpeg" }), cropped: true } : { poster: file, cropped: false };
}
