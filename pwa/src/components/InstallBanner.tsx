import { useEffect, useState } from "react";
import { Icon } from "@shared/components/Icon";
import { currentInstallOption, onInstallChange, promptInstall, type InstallOption } from "../install";

/** How long to wait for the browser's install signal before falling back to steps. */
const SETTLE_MS = 2500;

interface Props {
  onInstalled: () => void;
}

/**
 * Offers installing NoticeBoard each time it's opened in a phone's browser
 * (never in the installed app). "Not now" hides it until the next visit.
 */
export function InstallBanner({ onInstalled }: Props) {
  const [option, setOption] = useState<InstallOption>("none");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let settled = false;
    const refresh = async () => {
      const next = await currentInstallOption();
      // Before settling, only the browser's own signal (or "nothing") is shown;
      // the manual steps wait in case the signal is still on its way.
      setOption(settled || next !== "manual" ? next : "none");
    };
    const timer = window.setTimeout(() => {
      settled = true;
      refresh();
    }, SETTLE_MS);
    refresh();
    const unsubscribe = onInstallChange(refresh);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  if (dismissed || option === "none") return null;

  const install = async () => {
    if (await promptInstall()) onInstalled();
  };

  return (
    <aside className="ucpnb-install" aria-label="Install NoticeBoard">
      <img className="ucpnb-install-icon" src="/icon-192.png" alt="" width={44} height={44} />
      <div className="ucpnb-install-text">
        <strong>{option === "prompt" ? "Install NoticeBoard" : "Add NoticeBoard to your home screen"}</strong>
        {option === "prompt" && <span>Open it like an app, and get notified about new notices.</span>}
        {option === "ios" && (
          <span>
            Tap <Icon name="share" size={14} /> Share, then <b>Add to Home Screen</b>.
          </span>
        )}
        {option === "manual" && (
          <span>
            Open your browser menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>.
          </span>
        )}
      </div>
      <div className="ucpnb-install-actions">
        {option === "prompt" && (
          <button className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-sm" onClick={install}>
            Install
          </button>
        )}
        <button className="ucpnb-icon-btn ucpnb-icon-btn-sm" onClick={() => setDismissed(true)} aria-label="Not now" title="Not now">
          <Icon name="x" size={16} />
        </button>
      </div>
    </aside>
  );
}
