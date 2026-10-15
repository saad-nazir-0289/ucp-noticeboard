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
 * The message for a shared notice: its name and deadline on top, then its
 * details, and the link on its own at the very end. WhatsApp and most
 * chat apps turn that link into a preview card with the poster, so there's
 * nothing to paste. Very long details are shortened.
 */
export function shareCaption(notice: Notice, url: string = shareLink(notice)): string {
  const head = [notice.title];
  if (notice.deadline) head.push(`Deadline: ${formatDateTime(notice.deadline).replace(" · ", ", ")}`);
  const top = head.join("\n");
  const budget = MESSAGE_LIMIT - top.length - url.length - 4;
  let details = notice.description.trim();
  if (details.length > budget) {
    const cut = details.slice(0, Math.max(0, budget - 1));
    details = `${cut.slice(0, cut.lastIndexOf(" ") > budget * 0.6 ? cut.lastIndexOf(" ") : cut.length).trimEnd()}…`;
  }
  return [top, details, url].filter(Boolean).join("\n\n");
}

const MESSAGE_LIMIT = 2500;

export async function shareNotice(notice: Notice): Promise<"shared" | "copied" | "failed"> {
  const caption = shareCaption(notice);

  if (navigator.share) {
    try {
      // The link goes inside the text (not as a separate url), so it stays
      // at the end of the message instead of being put first.
      await navigator.share({ text: caption });
      return "shared";
    } catch (err) {
      // Closing the share sheet without picking anything isn't a failure.
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
