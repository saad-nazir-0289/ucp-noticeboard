import { useEffect, useRef } from "react";
import { Icon } from "@shared/components/Icon";

/**
 * A "Sponsored" spot in the feed, to help cover running costs. Off unless
 * configured at build time (see docs/MONETIZATION.md):
 *   VITE_ADSENSE_CLIENT + VITE_ADSENSE_SLOT → a Google AdSense in-feed ad
 *   VITE_SUPPORT_URL                        → our own "Support NoticeBoard" card
 * AdSense wins when both are set. Only in the PWA — never in the extension,
 * which runs inside the university's own portal.
 */
const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT;
const ADSENSE_SLOT = import.meta.env.VITE_ADSENSE_SLOT;
const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL;

const adsenseEnabled = Boolean(ADSENSE_CLIENT && ADSENSE_SLOT);

export const sponsorSlotEnabled = adsenseEnabled || Boolean(SUPPORT_URL);

/** After the 3rd notice, then every 8th: index 2, 10, 18, ... */
export function hasSponsorSlotAfter(index: number): boolean {
  return sponsorSlotEnabled && index >= 2 && (index - 2) % 8 === 0;
}

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

function loadAdsenseScript() {
  if (document.querySelector("script[data-ucpnb-adsense]")) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
  script.crossOrigin = "anonymous";
  script.dataset.ucpnbAdsense = "true";
  document.head.appendChild(script);
}

function AdsenseUnit() {
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    loadAdsenseScript();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* ad blockers and slow loads are expected; the slot just stays empty */
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={ADSENSE_SLOT}
      data-ad-format="fluid"
      data-full-width-responsive="true"
    />
  );
}

export function SponsorSlot({ variant }: { variant: "card" | "row" }) {
  if (!sponsorSlotEnabled) return null;

  return (
    <aside className={`ucpnb-sponsor ucpnb-sponsor-${variant}`} aria-label="Sponsored">
      <span className="ucpnb-sponsor-label">{adsenseEnabled ? "Sponsored" : "Support"}</span>
      {adsenseEnabled ? (
        <AdsenseUnit />
      ) : (
        <div className="ucpnb-sponsor-house">
          <span className="ucpnb-sponsor-icon">
            <Icon name="heartHandshake" size={22} />
          </span>
          <div>
            <strong>Keep NoticeBoard free</strong>
            <p>Built and paid for by a UCP student. If it helps you, chip in for the servers.</p>
          </div>
          <a className="ucpnb-btn ucpnb-btn-secondary ucpnb-btn-sm" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer">
            Support
          </a>
        </div>
      )}
    </aside>
  );
}
