/**
 * An installed app can stay open for days: switching to Instagram and back
 * doesn't reload it, so it would keep running the version it started with.
 * Whenever the app comes back on screen (and every half hour while it
 * stays there) this asks the server which version is current, and reloads
 * into a new one, but only when nothing is open: never mid-way through
 * writing a notice or reading one.
 */
const CHECK_EVERY_MS = 30 * 60 * 1000;

/** The app's own script, which is named after its contents: a new version, a new name. */
function scriptOf(html: string): string | null {
  return html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1] ?? null;
}

let newVersionWaiting = false;

async function check(): Promise<void> {
  if (!newVersionWaiting) {
    const running = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute("src");
    if (!running) return; // the dev server, not a build
    try {
      const response = await fetch("/", { cache: "no-store" });
      if (!response.ok) return;
      const current = scriptOf(await response.text());
      newVersionWaiting = current !== null && current !== running;
    } catch {
      return; // offline: try again next time
    }
  }
  // Something open (a notice, the editor, a menu): not now.
  if (newVersionWaiting && document.visibilityState === "visible" && !document.querySelector(".ucpnb-overlay")) {
    location.reload();
  }
}

export function keepUpToDate(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void check();
  });
  setInterval(() => void check(), CHECK_EVERY_MS);
  // Once something is closed, a waiting update can go ahead.
  document.addEventListener("click", () => {
    if (newVersionWaiting) setTimeout(() => void check(), 400);
  });
}
