import type { Notice } from "./types";
import { API_BASE_URL } from "./api/client";
import { formatDateTime } from "./format";

/**
 * Points at the backend's server-rendered preview page, NOT the PWA
 * directly. The PWA is a client-side single-page app — a link-unfurling
 * bot (WhatsApp, iMessage, etc.) fetching it directly gets one static
 * index.html with no idea which notice was meant, since none of that
 * runs JavaScript. The backend endpoint serves real per-notice Open
 * Graph tags (title, description, the notice's actual image) and
 * redirects an actual human straight into the real app instantly.
 */
export function shareLink(notice: Notice): string {
  return `${API_BASE_URL}/share/notice/${notice.id}`;
}

/**
 * The text that goes with a shared notice: its name and deadline on top,
 * then its details, and the link on its own at the very end. Long details
 * are shortened so the whole thing fits in a WhatsApp photo caption
 * (about 1,000 characters) without losing the link.
 */
export function shareCaption(notice: Notice, url: string = shareLink(notice)): string {
  const head = [notice.title];
  if (notice.deadline) head.push(`Deadline: ${formatDateTime(notice.deadline).replace(" · ", ", ")}`);
  const top = head.join("\n");
  const budget = CAPTION_LIMIT - top.length - url.length - 4;
  let details = notice.description.trim();
  if (details.length > budget) {
    const cut = details.slice(0, Math.max(0, budget - 1));
    details = `${cut.slice(0, cut.lastIndexOf(" ") > budget * 0.6 ? cut.lastIndexOf(" ") : cut.length).trimEnd()}…`;
  }
  return [top, details, url].filter(Boolean).join("\n\n");
}

const CAPTION_LIMIT = 1000;

// The poster as a file, so it can be shared as a photo (the whole poster,
// with the caption under it) instead of a link with a small preview. A
// JPEG at most 1600 px wide: every chat app accepts it, and it's small
// enough to fetch in the moment between tapping Share and the share sheet.
const posterFiles = new Map<number, Promise<File | null>>();

function posterJpegUrl(url: string): string {
  const marker = "/upload/";
  const at = url.indexOf(marker);
  if (!url.includes("res.cloudinary.com") || at === -1) return url;
  return `${url.slice(0, at + marker.length)}w_1600,c_limit,q_85,f_jpg/${url.slice(at + marker.length)}`;
}

/** Starts fetching a notice's poster for sharing (e.g. as soon as the notice is opened). */
export function preparePoster(notice: Notice): Promise<File | null> {
  if (!notice.imageUrl) return Promise.resolve(null);
  let file = posterFiles.get(notice.id);
  if (!file) {
    file = fetch(posterJpegUrl(notice.imageUrl))
      .then(async (response) => {
        if (!response.ok) return null;
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) return null;
        const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
        return new File([blob], `notice-${notice.id}.${extension}`, { type: blob.type });
      })
      .catch(() => null);
    posterFiles.set(notice.id, file);
  }
  return file;
}

const within = <T,>(promise: Promise<T>, ms: number, fallback: T) =>
  Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

export async function shareNotice(notice: Notice): Promise<"shared" | "copied" | "failed"> {
  const url = shareLink(notice);
  const caption = shareCaption(notice, url);

  if (navigator.share) {
    // With a poster: the photo itself, the text as its caption, the link at the end.
    const poster = await within(preparePoster(notice), 3500, null);
    if (poster && navigator.canShare?.({ files: [poster] })) {
      try {
        await navigator.share({ files: [poster], text: caption });
        return "shared";
      } catch (err) {
        // Closing the share sheet without picking anything isn't a failure.
        if (err instanceof Error && err.name === "AbortError") return "shared";
        // Otherwise (e.g. the app refused the file) share the text instead.
      }
    }
    try {
      await navigator.share({ text: caption });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "shared";
    }
  }

  try {
    await navigator.clipboard.writeText(caption);
    return "copied";
  } catch {
    return "failed";
  }
}
