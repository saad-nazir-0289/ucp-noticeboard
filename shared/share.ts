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
 * The message that goes with the link: the notice's name (and deadline)
 * on top, so a chat shows what it is before the preview card loads, and
 * even in apps that show no preview at all.
 */
export function shareMessage(notice: Notice): string {
  const lines = [notice.title];
  if (notice.deadline) lines.push(`Deadline: ${formatDateTime(notice.deadline).replace(" · ", ", ")}`);
  return lines.join("\n");
}

export async function shareNotice(notice: Notice): Promise<"shared" | "copied" | "failed"> {
  const url = shareLink(notice);
  const text = shareMessage(notice);

  if (navigator.share) {
    try {
      await navigator.share({ title: notice.title, text, url });
      return "shared";
    } catch (err) {
      // The user closing the share sheet without picking anything throws
      // AbortError — that's not a failure, don't fall through to the
      // clipboard fallback in that specific case.
      if (err instanceof Error && err.name === "AbortError") return "shared";
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return "copied";
  } catch {
    return "failed";
  }
}
