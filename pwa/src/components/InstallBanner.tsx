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
    // One slim line: the app's icon, a short how-to, and Install where the browser offers it.
    <aside className="ucpnb-install" aria-label="Install NoticeBoard">
      <img className="ucpnb-install-icon" src="/icon-192.png" alt="" width={22} height={22} />
      <p className="ucpnb-install-text">
        {option === "prompt" && "Get the app for quick access and alerts"}
        {option === "ios" && (
          <>
            Tap <Icon name="share" size={13} />, then <b>Add to Home Screen</b>
          </>
        )}
        {option === "manual" && (
          <>
            Get the app: tap <b>⋮</b>, then <b>Install app</b>
          </>
        )}
      </p>
      {option === "prompt" && (
        <button className="ucpnb-install-go" onClick={install}>
          Install
        </button>
      )}
      <button className="ucpnb-install-close" onClick={() => setDismissed(true)} aria-label="Not now" title="Not now">
        <Icon name="x" size={15} />
      </button>
    </aside>
  );
}
