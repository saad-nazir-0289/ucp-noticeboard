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
import { NoticeFeed } from "./components/NoticeFeed";

type Status = "loading" | "needs-identity" | "ready" | "error";
type PushState = "unsupported" | "subscribed" | "not-subscribed" | "working";

export function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrapNotices, setBootstrapNotices] = useState<Notice[]>([]);
  const [bootstrapCategories, setBootstrapCategories] = useState<Category[]>([]);
  const [pushState, setPushState] = useState<PushState>("not-subscribed");
  const [deepLinkNoticeId, setDeepLinkNoticeId] = useState<number | undefined>(undefined);

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
      const cleanUrl =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "") +
        window.location.hash;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

  const login = async (rollNumber: string) => {
    setStatus("loading");
    try {
      // Name is deliberately not sent here — the backend only ever uses a
      // client-supplied name at the moment an account is first created,
      // and falls back to the Roll Number itself if none is given. For
      // every returning user (the overwhelming majority), this field
      // would be silently ignored anyway.
      const result = await api.login(rollNumber, "");
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

  const handleEnableNotifications = async () => {
    if (!user) return;
    setPushState("working");
    try {
      await subscribeToPush(user.token);
      setPushState("subscribed");
    } catch {
      setPushState("not-subscribed");
    }
  };

  const handleDisableNotifications = async () => {
    if (!user) return;
    setPushState("working");
    await unsubscribeFromPush(user.token);
    setPushState("not-subscribed");
  };

  if (status === "loading") {
    return (
      <div className="ucpnb-page">
        <p className="ucpnb-status">Loading...</p>
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
      <div className="ucpnb-section">
        <div className="ucpnb-header">
          <h3>Latest Updates</h3>
          <div className="ucpnb-header-actions">
            {pushState === "unsupported" ? null : pushState === "subscribed" ? (
              <button className="ucpnb-btn" onClick={handleDisableNotifications}>
                🔔 Notifications On
              </button>
            ) : (
              <button
                className="ucpnb-btn ucpnb-btn-primary"
                onClick={handleEnableNotifications}
                disabled={pushState === "working"}
              >
                {pushState === "working" ? "Enabling..." : "🔔 Enable Notifications"}
              </button>
            )}
            {/* <button className="ucpnb-btn ucpnb-btn-link" onClick={handleChangeIdentity}>
              Not you?
            </button> */}
          </div>
        </div>

        <NoticeFeed
          token={user.token}
          initialNotices={bootstrapNotices}
          initialCategories={bootstrapCategories}
          deepLinkNoticeId={deepLinkNoticeId}
        />
      </div>
    </div>
  );
}
