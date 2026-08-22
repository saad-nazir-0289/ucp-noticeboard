import type { Notice } from "../types";

/**
 * The extension itself can't be "opened" via a link — it only activates
 * inside the real UCP portal page, and window.location inside a content
 * script refers to the PORTAL's URL, not anything of the extension's own.
 * So every share link, regardless of where the button was clicked,
 * points at the standalone PWA — the only surface that's actually a real,
 * openable webpage on its own.
 */
const PWA_BASE_URL = "https://ucp-noticeboard.msndev.workers.dev";

export async function shareNotice(notice: Notice): Promise<"shared" | "copied" | "failed"> {
  const url = `${PWA_BASE_URL}/?notice=${notice.id}`;

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
