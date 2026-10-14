import { useEffect, useState } from "react";
import type { AuthUser, Category, Notice } from "@shared/types";
import { api, setDeviceToken } from "@shared/api/client";
import { getSavedIdentity, saveIdentity, clearIdentity } from "./storage";
import { clearDeviceToken, getSavedDeviceToken, saveDeviceToken } from "./deviceUnlock";
import {
  registerServiceWorker,
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentEndpoint,
} from "./push";
import { RollNumberEntry } from "./RollNumberEntry";
import { NoticeFeed, getSavedViewMode } from "./components/NoticeFeed";
import { NoticeSkeleton } from "./components/NoticeSkeleton";
import { NoticeEditor } from "./components/NoticeEditor";
import { ManageNotices } from "./components/ManageNotices";
import { UnlockPrompt } from "./components/UnlockPrompt";

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
  const [showCategoryPrefs, setShowCategoryPrefs] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [prefsLoading, setPrefsLoading] = useState(false);

  // Publishing (Publishers/Admins only). `editor` is open when non-null;
  // `notice` set means editing rather than creating.
  const [unlocked, setUnlocked] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [editor, setEditor] = useState<{ notice?: Notice } | null>(null);
  const [showManage, setShowManage] = useState(false);
  // Bumped after a publish/edit/delete so the feed and list reload.
  const [refreshKey, setRefreshKey] = useState(0);

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

  // The server no longer accepts this phone's unlock (expired after 30
  // days unused, logged out by the Admin, or the role changed).
  const handleDeviceTokenInvalid = () => {
    clearDeviceToken();
    setUnlocked(false);
  };

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
      const deviceToken = result.role === "Student" ? null : getSavedDeviceToken(rollNumber);
      setDeviceToken(deviceToken, handleDeviceTokenInvalid);
      setUnlocked(deviceToken !== null);
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

  const handleOnboardingSubmit = (rollNumber: string, name: string, university: string, department: string) => {
    saveIdentity(rollNumber, name, university, department);
    login(rollNumber);
  };

  const handleChangeIdentity = () => {
    clearIdentity();
    clearDeviceToken();
    setDeviceToken(null);
    setUnlocked(false);
    setUser(null);
    setStatus("needs-identity");
  };

  const openEditor = (notice?: Notice) => {
    setEditor({ notice });
    if (!unlocked) setShowUnlock(true);
  };

  const handleUnlocked = (deviceToken: string) => {
    if (!user) return;
    saveDeviceToken(user.rollNumber, deviceToken);
    setDeviceToken(deviceToken, handleDeviceTokenInvalid);
    setUnlocked(true);
    setShowUnlock(false);
  };

  const handleSaved = (wasEdit: boolean) => {
    setEditor(null);
    setRefreshKey((k) => k + 1);
    showToast(wasEdit ? "Notice updated" : "Published — students are being notified");
  };

  const lockThisPhone = async () => {
    if (!user) return;
    try {
      const current = (await api.getMyDevices(user.token)).find((d) => d.isCurrent);
      if (current) await api.revokeMyDevice(current.id, user.token);
    } catch {
      /* logging out locally below is what matters on this device */
    }
    clearDeviceToken();
    setDeviceToken(null);
    setUnlocked(false);
    showToast("This phone is locked. Your PIN will be asked next time.");
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

  const openCategoryPrefs = async () => {
    if (!user) return;
    setPrefsLoading(true);
    setShowCategoryPrefs(true);
    try {
      const endpoint = await getCurrentEndpoint();
      if (!endpoint) {
        setShowCategoryPrefs(false);
        return;
      }
      const ids = await api.getPushCategories(endpoint, user.token);
      setSelectedCategoryIds(ids);
    } catch {
      setShowCategoryPrefs(false);
      showToast("Couldn't load your preferences");
    } finally {
      setPrefsLoading(false);
    }
  };

  const toggleCategorySelection = (id: number) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const saveCategoryPrefs = async () => {
    if (!user) return;
    const endpoint = await getCurrentEndpoint();
    if (!endpoint) return;
    try {
      await api.updatePushCategories(endpoint, selectedCategoryIds, user.token);
      setShowCategoryPrefs(false);
      showToast(
        selectedCategoryIds.length === 0
          ? "You'll be notified about everything"
          : "Notification preferences saved"
      );
    } catch {
      showToast("Couldn't save your preferences");
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
            {user.role !== "Student" && (
              <button className="ucpnb-btn" onClick={() => setShowManage(true)}>
                {user.role === "Admin" ? "All notices" : "My notices"}
              </button>
            )}
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
            {pushState === "subscribed" && bootstrapCategories.length > 0 && (
              <button className="ucpnb-btn ucpnb-btn-link" onClick={openCategoryPrefs}>
                Customize
              </button>
            )}
          </div>
        </div>

        {showCategoryPrefs && (
          <div className="ucpnb-grid-overlay" onClick={() => setShowCategoryPrefs(false)}>
            <div className="ucpnb-grid-modal" onClick={(e) => e.stopPropagation()}>
              <div className="ucpnb-grid-header">
                <h3>Notify me about</h3>
                <button className="ucpnb-modal-close" onClick={() => setShowCategoryPrefs(false)} aria-label="Close">
                  ×
                </button>
              </div>
              {prefsLoading ? (
                <p className="ucpnb-status">Loading...</p>
              ) : (
                <>
                  <p className="ucpnb-status">
                    Leave everything unchecked to get notified about everything, or pick
                    specific categories to only hear about those.
                  </p>
                  {bootstrapCategories.map((c) => (
                    <label key={c.id} className="ucpnb-checkbox-row">
                      <input
                        type="checkbox"
                        checked={selectedCategoryIds.includes(c.id)}
                        onChange={() => toggleCategorySelection(c.id)}
                      />
                      {c.name}
                    </label>
                  ))}
                  <div className="ucpnb-form-actions">
                    <button className="ucpnb-btn ucpnb-btn-primary" onClick={saveCategoryPrefs}>
                      Save
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <NoticeFeed
          key={refreshKey}
          token={user.token}
          // After a publish/edit the feed refetches instead of reusing the
          // notices bundled with login.
          initialNotices={refreshKey === 0 ? bootstrapNotices : undefined}
          initialCategories={bootstrapCategories}
          deepLinkNoticeId={refreshKey === 0 ? deepLinkNoticeId : undefined}
        />

        {user.role !== "Student" && (
          <button className="ucpnb-fab" onClick={() => openEditor()} aria-label="New notice">
            + New notice
          </button>
        )}

        {showManage && (
          <ManageNotices
            user={user}
            refreshKey={refreshKey}
            onNew={() => openEditor()}
            onEdit={(n) => openEditor(n)}
            onDeleted={() => {
              setRefreshKey((k) => k + 1);
              showToast("Notice deleted");
            }}
            onNeedsUnlock={() => setShowUnlock(true)}
            onLockPhone={lockThisPhone}
            onClose={() => setShowManage(false)}
          />
        )}

        {editor && (
          <NoticeEditor
            user={user}
            categories={bootstrapCategories}
            notice={editor.notice}
            onSaved={() => handleSaved(Boolean(editor.notice))}
            onClose={() => setEditor(null)}
            onNeedsUnlock={() => setShowUnlock(true)}
          />
        )}

        {showUnlock && (
          <UnlockPrompt token={user.token} onUnlocked={handleUnlocked} onClose={() => setShowUnlock(false)} />
        )}

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
