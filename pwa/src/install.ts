/**
 * Installing NoticeBoard to the home screen.
 *
 * Chrome's own install pop-up can't be shown on demand: Chrome decides
 * when to offer it, and after someone dismisses it once it stays quiet
 * for months. What a site can do is catch Chrome's "this can be
 * installed" signal (beforeinstallprompt) and show its own banner, on
 * every visit, whose button opens Chrome's install dialog. iPhones have no
 * such signal, so they get the Share → Add to Home Screen steps instead.
 * Nothing is shown inside the installed app itself.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallOption =
  /** Chrome / Edge / Samsung Internet: our button opens the browser's install dialog. */
  | "prompt"
  /** iPhone / iPad: Share → Add to Home Screen. */
  | "ios"
  /** Any other browser: its menu → Install app / Add to Home screen. */
  | "manual"
  /** Already installed, running as the app, or not a phone or tablet: show nothing. */
  | "none";

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Call once at startup, before anything renders: the signal can arrive early. */
export function watchForInstall(): void {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Our banner replaces Chrome's small bar, so the offer looks the same every visit.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}

export function onInstallChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Running as the installed app (home-screen icon), not in a browser tab. */
export function isRunningInstalled(): boolean {
  return (
    ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"].some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isPhoneOrTablet(): boolean {
  return navigator.maxTouchPoints > 0 && window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Whether NoticeBoard is already installed on this phone, asked from a
 * browser tab (Chrome on Android; see related_applications in the manifest).
 */
async function installedElsewhere(): Promise<boolean> {
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
  if (!nav.getInstalledRelatedApps) return false;
  try {
    return (await nav.getInstalledRelatedApps()).length > 0;
  } catch {
    return false;
  }
}

/** What to offer right now. Settles a moment after start, once the browser has had its say. */
export async function currentInstallOption(): Promise<InstallOption> {
  if (installed || isRunningInstalled() || !isPhoneOrTablet()) return "none";
  if (deferredPrompt) return "prompt";
  if (isIos()) return "ios";
  if (await installedElsewhere()) return "none";
  return "manual";
}

/** Opens the browser's install dialog. True when the person installed it. */
export async function promptInstall(): Promise<boolean> {
  const prompt = deferredPrompt;
  if (!prompt) return false;
  deferredPrompt = null; // each signal can open the dialog only once
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === "accepted") installed = true;
  notify();
  return outcome === "accepted";
}
