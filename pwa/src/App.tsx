import { useEffect, useState } from "react";
import type { AuthUser, Category, Notice } from "./types";
import { api } from "./api/client";
import { getSavedIdentity, saveIdentity, clearIdentity } from "./storage";
import {
  registerServiceWorker,
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
} from "./push";
import { RollNumberEntry } from "./RollNumberEntry";
import { NoticeFeed, getSavedViewMode } from "./components/NoticeFeed";
import { NoticeSkeleton } from "./components/NoticeSkeleton";

type Status = "loading" | "needs-identity" | "ready" | "error";
type PushState = "unsupported" | "subscribed" | "not-subscribed" | "working";

export function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrapNotices, setBootstrapNotices] = useState<Notice[]>([]);
  const [bootstrapCategories, setBootstrapCategories] = useState<Category[]>([]);
  const [pushState, setPushState] = useState<PushState>("not-subscribed");
  const [deepLinkNoticeId, setDeepLinkNoticeId] = useState<number | undefined>(undefined);
  const [autoEnableNotifications, setAutoEnableNotifications] = useState(false);
  const [urlActivationCode, setUrlActivationCode] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    registerServiceWorker();

    // A shared notice link looks like ...?notice=<id>. Captured into state
    // here (not left in the URL) so it survives the onboarding step too —
    // someone opening a shared link for the very first time still goes
    // through Roll Number entry first, then lands on the actual notice
    // instead of just the plain feed.
    const params = new URLSearchParams(window.location.search);
    const noticeParam = params.get("notice");
    if (noticeParam) {
      const id = Number(noticeParam);
      if (!Number.isNaN(id)) setDeepLinkNoticeId(id);
      params.delete("notice");
    }

    // The extension's notifications bell can't actually enable push itself
    // (it runs inside the UCP portal page, not a context that can hold a
    // push subscription), so it links here instead. This flag makes that
    // one click actually feel like one click — the permission prompt
    // fires automatically on arrival instead of making them find and tap
    // yet another button once they land.
    if (params.get("enableNotifications")) {
      setAutoEnableNotifications(true);
      params.delete("enableNotifications");
    }

    // Same activation link the extension understands — someone might
    // open it directly in a regular browser rather than via the
    // extension, especially before they've installed it at all.
    const activateParam = params.get("ucpnb_activate");
    if (activateParam) {
      setUrlActivationCode(activateParam);
      params.delete("ucpnb_activate");
    }

    const cleanUrl =
      window.location.pathname +
      (params.toString() ? `?${params.toString()}` : "") +
      window.location.hash;
    window.history.replaceState({}, "", cleanUrl);
  }, []);

  const login = async (rollNumber: string) => {
    setStatus("loading");
    try {
      // Name is deliberately not sent here — the backend only ever uses a
      // client-supplied name at the moment an account is first created,
      // and falls back to the Roll Number itself if none is given. For
      // every returning user (the overwhelming majority), this field
      // would be silently ignored anyway.
      //
      // A fresh activation link in the URL is only relevant for a
      // brand-new Publisher's first-ever claim, or the one-time Admin
      // bootstrap — both single-use. Role itself is granted directly
      // from what's already stored for this account, so it shows up
      // correctly on any device with zero extra steps.
      const activationCode = urlActivationCode;
      const result = await api.login(rollNumber, "", activationCode);
      setUser(result);
      setBootstrapNotices(result.notices);
      setBootstrapCategories(result.categories);
      setStatus("ready");

      api.recordVisit(result.token).catch(() => {
        /* non-critical */
      });

      getPushSubscriptionState().then((state) => {
        setPushState(state);
      });
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    const saved = getSavedIdentity();
    if (!saved) {
      setStatus("needs-identity");
      return;
    }
    login(saved.rollNumber);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOnboardingSubmit = (rollNumber: string) => {
    saveIdentity(rollNumber);
    login(rollNumber);
  };

  const handleChangeIdentity = () => {
    clearIdentity();
    setUser(null);
    setStatus("needs-identity");
  };

  const enableNotifications = async () => {
    if (!user) return;
    setPushState("working");
    try {
      await subscribeToPush(user.token);
      setPushState("subscribed");
      showToast("Notifications turned on");
    } catch {
      setPushState("not-subscribed");
      showToast("Couldn't turn on notifications");
    }
  };

  const disableNotifications = async () => {
    if (!user) return;
    setPushState("working");
    try {
      await unsubscribeFromPush(user.token);
    } finally {
      // Even if the unsubscribe call itself failed, the device-side
      // subscription is gone either way — reflect that rather than
      // leaving the button stuck showing "on".
      setPushState("not-subscribed");
      showToast("Notifications turned off");
    }
  };

  const handleToggleNotifications = () => {
    if (pushState === "working" || pushState === "unsupported") return;
    if (pushState === "subscribed") {
      disableNotifications();
    } else {
      enableNotifications();
    }
  };

  useEffect(() => {
    if (status !== "ready" || !autoEnableNotifications || pushState !== "not-subscribed") return;
    // Only ever fire once — reset immediately so a later re-render (or the
    // user manually disabling notifications afterward) never re-triggers it.
    setAutoEnableNotifications(false);
    enableNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, autoEnableNotifications, pushState]);

  if (status === "loading") {
    return (
      <div className="ucpnb-page">
        <div className="ucpnb-section">
          <div className="ucpnb-header">
            <h3>Latest Updates</h3>
          </div>
          <NoticeSkeleton viewMode={getSavedViewMode()} />
        </div>
      </div>
    );
  }

  if (status === "needs-identity") {
    return <RollNumberEntry onSubmit={handleOnboardingSubmit} />;
  }

  if (status === "error" || !user) {
    return (
      <div className="ucpnb-page">
        <p className="ucpnb-error">
          Couldn't reach the NoticeBoard server. Please try again shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="ucpnb-page">
      {toast && <div className="ucpnb-toast">{toast}</div>}
      <div className="ucpnb-section">
        <div className="ucpnb-header">
          <h3>Latest Updates</h3>
          <div className="ucpnb-header-actions">
            {pushState !== "unsupported" && (
              <button
                className="ucpnb-bell-btn"
                onClick={handleToggleNotifications}
                disabled={pushState === "working"}
                aria-label={pushState === "subscribed" ? "Turn off notifications" : "Turn on notifications"}
                title={pushState === "subscribed" ? "Turn off notifications" : "Turn on notifications"}
              >
                {pushState === "subscribed" ? "🔕" : "🔔"}
              </button>
            )}
            <button className="ucpnb-btn ucpnb-btn-link" onClick={handleChangeIdentity}>
              Not you?
            </button>
          </div>
        </div>

        <NoticeFeed
          token={user.token}
          initialNotices={bootstrapNotices}
          initialCategories={bootstrapCategories}
          deepLinkNoticeId={deepLinkNoticeId}
        />

        <div className="ucpnb-footer">
          <a
            href="https://chromewebstore.google.com/detail/dmkdgckajefikfbbfblihmnamjiaemfg?utm_source=item-share-cb"
            target="_blank"
            rel="noopener noreferrer"
          >
            💬 Enjoying this? Leave feedback & a review
          </a>
        </div>
      </div>
    </div>
  );
}
