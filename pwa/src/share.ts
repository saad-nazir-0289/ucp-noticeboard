import type { Notice } from "./types";

/**
 * The PWA is its own real webpage, so it can safely build a link to
 * itself using window.location — unlike the extension, which is injected
 * into the UCP portal and has no such thing as "its own URL."
 */
export async function shareNotice(notice: Notice): Promise<"shared" | "copied" | "failed"> {
  const url = `${window.location.origin}${window.location.pathname}?notice=${notice.id}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: notice.title, url });
      return "shared";
    } catch (err) {
      // The user closing the share sheet without picking anything throws
      // AbortError — that's not a failure, just don't fall through to the
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
