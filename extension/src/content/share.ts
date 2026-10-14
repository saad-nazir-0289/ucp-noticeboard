import type { Notice } from "../types";
import { API_BASE_URL } from "../api/client";

// Still used directly by the notifications bell (NoticeBoard.tsx) — that
// link is meant to open the real app, unlike a notice share link, which
// needs the rich-preview endpoint below instead.
// Set per build mode in vite.content.config.ts.
export const PWA_BASE_URL = import.meta.env.VITE_PWA_BASE_URL;

/**
 * Points at the backend's server-rendered preview page, NOT the PWA
 * directly. The PWA is a client-side single-page app — a link-unfurling
 * bot (WhatsApp, iMessage, etc.) fetching it directly gets one static
 * index.html with no idea which notice was meant, since none of that
 * runs JavaScript. The backend endpoint serves real per-notice Open
 * Graph tags (title, description, the notice's actual image) and
 * redirects an actual human straight into the real app instantly.
 */
export async function shareNotice(notice: Notice): Promise<"shared" | "copied" | "failed"> {
  const url = `${API_BASE_URL}/share/notice/${notice.id}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: notice.title, url });
      return "shared";
    } catch (err) {
      // The user closing the share sheet without picking anything throws
      // AbortError — that's not a failure, don't fall through to the
      // clipboard fallback in that specific case.
      if (err instanceof Error && err.name === "AbortError") return "shared";
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
