/**
 * Cloudinary can resize/compress/reformat an already-uploaded image on the
 * fly, just by adding parameters to its URL — no re-upload, no backend
 * involvement. This means a card can request a small, fast-loading version
 * of an image instead of downloading whatever full-resolution file the
 * Publisher originally uploaded, which is often much larger than any card
 * will ever display it at.
 *
 * Safe no-op for anything that isn't a Cloudinary delivery URL (e.g. an
 * externally pasted image link) — those are returned completely
 * unchanged, since we have no way to resize something we don't host.
 */
export function optimizeImageUrl(url: string | null, width: number): string | null {
  if (!url) return url;

  const marker = "/upload/";
  const markerIndex = url.indexOf(marker);
  if (!url.includes("res.cloudinary.com") || markerIndex === -1) {
    return url;
  }

  const insertAt = markerIndex + marker.length;
  // w_<width>  — resize to this width, height auto
  // q_auto     — Cloudinary picks the best quality/size tradeoff automatically
  // f_auto     — serves WebP/AVIF to browsers that support it, falls back otherwise
  return `${url.slice(0, insertAt)}w_${width},q_auto,f_auto/${url.slice(insertAt)}`;
}
