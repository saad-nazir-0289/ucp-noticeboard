import type { SharedContent } from "@shared/shareParser";

// Reads (once) what the service worker stashed from "Share to NoticeBoard"
// — see the share_target in public/manifest.json and receiveShare in
// public/sw.js. Shares older than 10 minutes are ignored as stale.
const SHARE_CACHE = "ucpnb-share";
const MAX_AGE_MS = 10 * 60 * 1000;

export interface SharedPayload {
  content: SharedContent;
  image?: File;
}

export async function takeSharedPayload(): Promise<SharedPayload | null> {
  if (!("caches" in window)) return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const metaResponse = await cache.match("/__share/meta");
    if (!metaResponse) return null;

    const meta = (await metaResponse.json()) as SharedContent & { receivedAt: number };
    const imageResponse = await cache.match("/__share/image");
    await cache.delete("/__share/meta");
    await cache.delete("/__share/image");

    if (Date.now() - meta.receivedAt > MAX_AGE_MS) return null;

    let image: File | undefined;
    if (imageResponse) {
      const blob = await imageResponse.blob();
      const name = decodeURIComponent(imageResponse.headers.get("X-File-Name") ?? "shared-image");
      image = new File([blob], name, { type: blob.type });
    }
    return { content: { title: meta.title, text: meta.text, url: meta.url }, image };
  } catch {
    return null;
  }
}
