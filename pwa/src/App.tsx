import { useEffect, useRef, useState } from "react";
import type { AuthUser, Category, Notice } from "@shared/types";
import { ApiError, api, setDeviceToken } from "@shared/api/client";
import { ImageUploadError, uploadImage } from "@shared/api/imageUpload";
import { clearIdentity, clearLastFeed, getLastFeed, getSavedIdentity, saveIdentity, saveLastFeed } from "./storage";
import { clearDeviceToken, getSavedDeviceToken, saveDeviceToken } from "./deviceUnlock";
import { takeSharedPayload, type SharedPayload } from "./shareInbox";
import {
  registerServiceWorker,
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentEndpoint,
} from "./push";
import { RollNumberEntry } from "./RollNumberEntry";
import { NoticeFeed, getSavedViewMode, saveViewMode, type ViewMode } from "./components/NoticeFeed";
import { NoticeSkeleton } from "./components/NoticeSkeleton";
import { NoticeEditor } from "./components/NoticeEditor";
import { ManageNotices } from "./components/ManageNotices";
import { UnlockPrompt } from "./components/UnlockPrompt";
import { InstallBanner } from "./components/InstallBanner";
import { getThemePreference, setThemePreference, type ThemePreference } from "./theme";
import { useBackToClose } from "./backLayers";
import { coachDone, coachDue, coachShown } from "./coach";
import { Icon } from "@shared/components/Icon";
import { Avatar } from "@shared/components/Tags";
import { EmptyState } from "@shared/components/EmptyState";

type Status = "loading" | "needs-identity" | "ready" | "error";
type PushState = "unsupported" | "subscribed" | "not-subscribed" | "working";

type ToastTone = "success" | "error" | "info";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function App() {
  const [status, setStatus] = useState<Status>("loading");
  // Why signing in failed, in words that say what's wrong.
  const [loginError, setLoginError] = useState<string | null>(null);
  // A rejected roll number, shown on the entry screen.
  const [identityError, setIdentityError] = useState<string | null>(null);
  // Showing the notices saved on this device because the server couldn't be reached.
  const [offline, setOffline] = useState<{ reason: string; savedAt: string } | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrapNotices, setBootstrapNotices] = useState<Notice[]>([]);
  const [bootstrapCategories, setBootstrapCategories] = useState<Category[]>([]);
  const [pushState, setPushState] = useState<PushState>("not-subscribed");
  // "Turn on notifications" tip by the bell (see coach.ts); the number is where its arrow points.
  const bellRef = useRef<HTMLButtonElement>(null);
  const [notificationsTip, setNotificationsTip] = useState<number | null>(null);
  const [deepLinkNoticeId, setDeepLinkNoticeId] = useState<number | undefined>(undefined);
  const [autoEnableNotifications, setAutoEnableNotifications] = useState(false);
  const [urlActivationCode, setUrlActivationCode] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [showCategoryPrefs, setShowCategoryPrefs] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [prefsLoading, setPrefsLoading] = useState(false);

  // Publishing (Publishers/Admins only). `editor` is open when non-null;
  // `notice` set means editing rather than creating.
  const [unlocked, setUnlocked] = useState(false);
  const [hasPin, setHasPin] = useState(true);
  const [showUnlock, setShowUnlock] = useState(false);
  const [editor, setEditor] = useState<{ notice?: Notice; shared?: SharedPayload } | null>(null);
  // Arrived via "Share to NoticeBoard" (?share=1, see public/sw.js).
  const [arrivedFromShare, setArrivedFromShare] = useState(false);
  const [showManage, setShowManage] = useState(false);
  // Bumped after a publish/edit/delete so the feed and list reload.
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAccount, setShowAccount] = useState(false);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(getThemePreference);
  const [viewMode, setViewMode] = useState<ViewMode>(getSavedViewMode);
  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    saveViewMode(mode);
  };
  // Back gesture closes these instead of leaving the app.
  useBackToClose(showAccount, () => setShowAccount(false));
  useBackToClose(showCategoryPrefs, () => setShowCategoryPrefs(false));
  useBackToClose(showUnlock, () => setShowUnlock(false));
  useBackToClose(showManage, () => setShowManage(false));
  useBackToClose(editor !== null, () => setEditor(null));
  const [myLogoUrl, setMyLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  // Successes confirm and go; problems and notes stay a little longer.
  const showToast = (message: string, tone: ToastTone = "success") => {
    window.clearTimeout(toastTimer.current);
    setToast({ message, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), tone === "success" ? 2500 : 4500);
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
    if (params.get("share")) {
      setArrivedFromShare(true);
      params.delete("share");
    }

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

  /** `quiet`: retrying behind saved notices, without the loading screen. */
  const login = async (rollNumber: string, quiet = false) => {
    if (!quiet) setStatus("loading");
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
      setHasPin(result.hasPin !== false);
      setUser(result);
      setMyLogoUrl(result.logoUrl ?? null);
      setBootstrapNotices(result.notices);
      setBootstrapCategories(result.categories);
      saveLastFeed({
        rollNumber,
        user: { id: result.id, name: result.name, rollNumber: result.rollNumber, role: result.role },
        logoUrl: result.logoUrl ?? null,
        notices: result.notices,
        categories: result.categories,
      });
      if (quiet) setRefreshKey((k) => k + 1); // fresh notices replace the saved ones
      setOffline(null);
      setLoginError(null);
      setStatus("ready");

      api.recordVisit(result.token).catch(() => {
        /* non-critical */
      });

      getPushSubscriptionState().then((state) => {
        setPushState(state);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const httpStatus = err instanceof ApiError ? err.status : 0;
      // The server turned this roll number down: ask for it again, saying why.
      if (httpStatus === 400) {
        clearIdentity();
        clearLastFeed();
        setIdentityError(message);
        setStatus("needs-identity");
        return;
      }
      // Couldn't sign in right now: show what this device saved last time, if anything.
      const saved = getLastFeed(rollNumber);
      if (saved) {
        if (!quiet) {
          setUser({ ...saved.user, token: "" });
          setMyLogoUrl(saved.logoUrl);
          setBootstrapNotices(saved.notices);
          setBootstrapCategories(saved.categories);
        }
        setOffline({ reason: message, savedAt: saved.savedAt });
        setStatus("ready");
        return;
      }
      setLoginError(message);
      setStatus("error");
    }
  };

  // The first few times the app is opened with notifications off: a
  // moment after the notices appear (and after the swipe demo), the bell
  // rings and a card under it says what turning them on gets you.
  useEffect(() => {
    if (status !== "ready" || offline || pushState !== "not-subscribed" || !coachDue("notifications")) return;
    const timer = window.setTimeout(() => {
      const bell = bellRef.current?.getBoundingClientRect();
      // Not over something the person has open.
      if (!bell || document.querySelector(".ucpnb-overlay")) return;
      coachShown("notifications");
      setNotificationsTip(Math.max(16, window.innerWidth - 12 - (bell.left + bell.width / 2) - 6));
    }, 5500);
    return () => window.clearTimeout(timer);
  }, [status, offline, pushState]);

  useEffect(() => {
    if (pushState === "subscribed") {
      coachDone("notifications");
      setNotificationsTip(null);
    }
  }, [pushState]);

  // Back online (or back in the app): try again behind the saved notices.
  useEffect(() => {
    if (!offline) return;
    const retry = () => {
      const saved = getSavedIdentity();
      if (saved && document.visibilityState === "visible") login(saved.rollNumber, true);
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    const timer = window.setInterval(retry, 60_000);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline]);

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
    setIdentityError(null);
    saveIdentity(rollNumber, name, university, department);
    login(rollNumber);
  };

  const handleChangeIdentity = () => {
    clearIdentity();
    clearLastFeed();
    setOffline(null);
    setLoginError(null);
    clearDeviceToken();
    setDeviceToken(null);
    setUnlocked(false);
    setUser(null);
    setStatus("needs-identity");
  };

  const openEditor = (notice?: Notice, shared?: SharedPayload) => {
    setEditor({ notice, shared });
    if (!unlocked) setShowUnlock(true);
  };

  // Once signed in, turn a share into a pre-filled new notice.
  useEffect(() => {
    if (status !== "ready" || !arrivedFromShare || !user) return;
    setArrivedFromShare(false);
    takeSharedPayload().then((payload) => {
      if (!payload) return;
      if (user.role === "Student") {
        showToast("Only publishers can post notices", "info");
        return;
      }
      openEditor(undefined, payload);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, arrivedFromShare, user]);

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
    showToast(wasEdit ? "Notice updated" : "Notice published and sent to students");
  };

  // A publisher's logo, shown on their notices. Changing it counts as a
  // posting action, so this phone has to be unlocked first.
  const changeLogo = async (file: File | null) => {
    if (!user) return;
    setLogoBusy(true);
    try {
      const url = file ? await uploadImage(file, user.token) : null;
      const result = await api.updateMyLogo(url, user.token);
      setMyLogoUrl(result.logoUrl);
      setRefreshKey((k) => k + 1);
      showToast(result.logoUrl ? "Logo updated on all your notices" : "Logo removed");
    } catch (err) {
      showToast(err instanceof ImageUploadError ? err.message : "Could not update your logo", "error");
    } finally {
      setLogoBusy(false);
    }
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
    showToast("Posting locked on this phone");
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
      showToast("Could not turn on notifications", "error");
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
      showToast("Could not load your preferences", "error");
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
          ? "You will be notified about all categories"
          : "Notification preferences saved"
      );
    } catch {
      showToast("Could not save your preferences", "error");
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

  const appBar = (actions?: React.ReactNode) => (
    <header className="ucpnb-appbar">
      <div className="ucpnb-appbar-inner">
        <div className="ucpnb-brand">
          <span className="ucpnb-logo">
            <Icon name="megaphone" size={18} />
          </span>
          <div className="ucpnb-brand-text">
            <strong>NoticeBoard</strong>
            <span>UCP</span>
          </div>
        </div>
        {actions && <div className="ucpnb-appbar-actions">{actions}</div>}
      </div>
    </header>
  );

  if (status === "loading") {
    return (
      <div className="ucpnb-app">
        {appBar()}
        <main className="ucpnb-main">
          <NoticeSkeleton viewMode={getSavedViewMode()} />
        </main>
      </div>
    );
  }

  if (status === "needs-identity") {
    return <RollNumberEntry onSubmit={handleOnboardingSubmit} serverError={identityError} />;
  }

  if (status === "error" || !user) {
    return (
      <div className="ucpnb-app">
        {appBar()}
        <main className="ucpnb-main">
          <EmptyState icon="inbox" title="Couldn't open NoticeBoard">
            {loginError ?? "Signing in didn't finish. Try again."}
          </EmptyState>
          <div className="ucpnb-center ucpnb-error-actions">
            <button className="ucpnb-btn ucpnb-btn-primary" onClick={() => window.location.reload()}>
              <Icon name="restore" size={16} />
              Try again
            </button>
            <button className="ucpnb-btn ucpnb-btn-ghost" onClick={handleChangeIdentity}>
              Use a different roll number
            </button>
          </div>
        </main>
      </div>
    );
  }

  const canPublish = user.role !== "Student";
  // The account's name wins (the portal's, or one the Admin set); the name
  // typed when first opening the app only fills in for an account that has
  // none yet (named after its Roll Number).
  const hasRealName = user.name.trim() !== "" && user.name.toUpperCase() !== user.rollNumber.toUpperCase();
  const displayName = hasRealName ? user.name : getSavedIdentity()?.name || user.name;
  const notificationsOn = pushState === "subscribed";

  return (
    <div className="ucpnb-app">
      {toast && (
        <div className={`ucpnb-toast ucpnb-toast-${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
          <Icon name={toast.tone === "success" ? "check" : toast.tone === "error" ? "alertCircle" : "info"} size={16} strokeWidth={2.6} />
          {toast.message}
        </div>
      )}

      {appBar(
        <>
          {canPublish && (
            <button
              className="ucpnb-btn ucpnb-btn-secondary ucpnb-appbar-btn"
              onClick={() => setShowManage(true)}
              aria-label={user.role === "Admin" ? "All notices" : "My notices"}
            >
              <Icon name="fileText" size={17} />
              <span>{user.role === "Admin" ? "All notices" : "My notices"}</span>
            </button>
          )}
          {pushState !== "unsupported" && (
            <button
              ref={bellRef}
              className={`ucpnb-icon-btn${notificationsOn ? " is-active" : ""}${notificationsTip !== null ? " is-calling" : ""}`}
              onClick={() => {
                setNotificationsTip(null);
                handleToggleNotifications();
              }}
              disabled={pushState === "working"}
              aria-label={notificationsOn ? "Turn off notifications" : "Turn on notifications"}
              title={notificationsOn ? "Notifications are on. Tap to turn them off." : "Turn on notifications"}
            >
              <Icon name={notificationsOn ? "bell" : "bellOff"} />
            </button>
          )}
          <button className="ucpnb-avatar-btn" onClick={() => setShowAccount(true)} aria-label="Account and settings">
            <Avatar name={displayName} size="md" imageUrl={myLogoUrl} />
          </button>
        </>
      )}

      {notificationsTip !== null && pushState === "not-subscribed" && (
        <div
          className="ucpnb-coach"
          role="dialog"
          aria-label="Turn on notifications"
          style={{ "--ucpnb-coach-arrow": `${notificationsTip}px` } as React.CSSProperties}
        >
          <strong>Never miss a notice</strong>
          <p>Turn on notifications to hear about new notices, and get a reminder before a deadline, even when the app is closed.</p>
          <div className="ucpnb-coach-actions">
            <button className="ucpnb-btn ucpnb-btn-ghost ucpnb-btn-sm" onClick={() => setNotificationsTip(null)}>
              Not now
            </button>
            <button
              className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-sm"
              onClick={() => {
                setNotificationsTip(null);
                handleToggleNotifications();
              }}
            >
              <Icon name="bell" size={15} />
              Turn on
            </button>
          </div>
        </div>
      )}

      <main className="ucpnb-main">
        {offline && (
          <div className="ucpnb-offline" role="status">
            <Icon name="alertCircle" size={18} />
            <div>
              <strong>{offline.reason}</strong>
              <span>
                Showing the notices saved on this phone on{" "}
                {new Date(offline.savedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.
              </span>
            </div>
            <button className="ucpnb-btn ucpnb-btn-secondary ucpnb-btn-sm" onClick={() => getSavedIdentity() && login(getSavedIdentity()!.rollNumber, true)}>
              Retry
            </button>
          </div>
        )}
        <InstallBanner onInstalled={() => showToast("NoticeBoard installed. Open it from your home screen.")} />
        <NoticeFeed
          key={refreshKey}
          token={user.token}
          // After a publish/edit the feed refetches instead of reusing the
          // notices bundled with login.
          initialNotices={refreshKey === 0 ? bootstrapNotices : undefined}
          initialCategories={bootstrapCategories}
          deepLinkNoticeId={refreshKey === 0 ? deepLinkNoticeId : undefined}
          viewMode={viewMode}
          onViewModeChange={changeViewMode}
        />
      </main>

      {canPublish && (
        <button className="ucpnb-fab" onClick={() => openEditor()} aria-label="New notice" title="New notice">
          <Icon name="plus" size={26} strokeWidth={2.4} />
        </button>
      )}

      {showAccount && (
        <div className="ucpnb-overlay" onClick={() => setShowAccount(false)}>
          <div className="ucpnb-sheet ucpnb-sheet-compact" role="dialog" aria-modal="true" aria-label="Account" onClick={(e) => e.stopPropagation()}>
            <div className="ucpnb-sheet-handle" aria-hidden="true" />
            <div className="ucpnb-sheet-content">
              <div className="ucpnb-account">
                <Avatar name={displayName} size="md" imageUrl={myLogoUrl} />
                <div>
                  <strong>{displayName}</strong>
                  <span>
                    {user.rollNumber}
                    {user.role !== "Student" && <span className="ucpnb-badge ucpnb-badge-success">{user.role}</span>}
                  </span>
                </div>
              </div>

              <div className="ucpnb-menu">
                {pushState !== "unsupported" && (
                  <button className="ucpnb-menu-item" onClick={handleToggleNotifications} disabled={pushState === "working"}>
                    <Icon name={notificationsOn ? "bell" : "bellOff"} />
                    <span>Notifications</span>
                    <span className={notificationsOn ? "ucpnb-switch is-on" : "ucpnb-switch"} aria-hidden="true" />
                  </button>
                )}
                {notificationsOn && bootstrapCategories.length > 0 && (
                  <button
                    className="ucpnb-menu-item"
                    onClick={() => {
                      setShowAccount(false);
                      openCategoryPrefs();
                    }}
                  >
                    <Icon name="sliders" />
                    <span>Notification topics</span>
                    <Icon name="chevronRight" size={18} />
                  </button>
                )}
                {canPublish &&
                  (unlocked ? (
                    <label className={logoBusy ? "ucpnb-menu-item is-busy" : "ucpnb-menu-item"}>
                      <Icon name="image" />
                      <span>{myLogoUrl ? "Change your logo" : "Add your logo"}</span>
                      {logoBusy ? <span className="ucpnb-spinner" /> : <Icon name="chevronRight" size={18} />}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        disabled={logoBusy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) changeLogo(file);
                        }}
                      />
                    </label>
                  ) : (
                    <button
                      className="ucpnb-menu-item"
                      onClick={() => {
                        setShowAccount(false);
                        setShowUnlock(true);
                      }}
                    >
                      <Icon name="image" />
                      <span>{myLogoUrl ? "Change your logo" : "Add your logo"}</span>
                      <Icon name="lock" size={16} />
                    </button>
                  ))}
                {canPublish && unlocked && myLogoUrl && (
                  <button className="ucpnb-menu-item" onClick={() => changeLogo(null)} disabled={logoBusy}>
                    <Icon name="trash" />
                    <span>Remove your logo</span>
                  </button>
                )}
                {canPublish && unlocked && (
                  <button
                    className="ucpnb-menu-item"
                    onClick={() => {
                      setShowAccount(false);
                      lockThisPhone();
                    }}
                  >
                    <Icon name="lock" />
                    <span>Lock posting on this phone</span>
                  </button>
                )}
                <div className="ucpnb-menu-item ucpnb-touch-only">
                  <Icon name="list" />
                  <span id="ucpnb-layout-label">Layout</span>
                  <div className="ucpnb-segmented" role="radiogroup" aria-labelledby="ucpnb-layout-label">
                    {(["list", "card"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={viewMode === mode}
                        className={viewMode === mode ? "is-active" : undefined}
                        onClick={() => changeViewMode(mode)}
                      >
                        {mode === "list" ? "List" : "Cards"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ucpnb-menu-item">
                  <Icon name="moon" />
                  <span id="ucpnb-appearance-label">Appearance</span>
                  <div className="ucpnb-segmented" role="radiogroup" aria-labelledby="ucpnb-appearance-label">
                    {THEME_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={themePreference === o.value}
                        className={themePreference === o.value ? "is-active" : undefined}
                        onClick={() => {
                          setThemePreference(o.value);
                          setThemePreferenceState(o.value);
                        }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <a
                  className="ucpnb-menu-item"
                  href="https://chromewebstore.google.com/detail/dmkdgckajefikfbbfblihmnamjiaemfg?utm_source=item-share-cb"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="message" />
                  <span>Send feedback</span>
                  <Icon name="externalLink" size={16} />
                </a>
                <button
                  className="ucpnb-menu-item ucpnb-menu-item-danger"
                  onClick={() => {
                    setShowAccount(false);
                    handleChangeIdentity();
                  }}
                >
                  <Icon name="restore" />
                  <span>Switch account</span>
                </button>
              </div>
              <p className="ucpnb-app-version">Version {__APP_VERSION__}</p>
            </div>
          </div>
        </div>
      )}

      {showCategoryPrefs && (
        <div className="ucpnb-overlay" onClick={() => setShowCategoryPrefs(false)}>
          <div className="ucpnb-sheet ucpnb-sheet-compact" role="dialog" aria-modal="true" aria-label="Notification topics" onClick={(e) => e.stopPropagation()}>
            <div className="ucpnb-sheet-header">
              <h3>Notify me about</h3>
              <button className="ucpnb-icon-btn" onClick={() => setShowCategoryPrefs(false)} aria-label="Close">
                <Icon name="x" />
              </button>
            </div>
            <div className="ucpnb-sheet-content">
              <p className="ucpnb-sheet-text">Pick the topics you care about, or leave them all off to hear about everything.</p>
              {prefsLoading ? (
                <div className="ucpnb-skeleton" style={{ height: 34, width: "70%" }} />
              ) : (
                <div className="ucpnb-chips ucpnb-chips-wrap">
                  {bootstrapCategories.map((c) => {
                    const on = selectedCategoryIds.includes(c.id);
                    return (
                      <button key={c.id} className={on ? "ucpnb-chip is-active" : "ucpnb-chip"} onClick={() => toggleCategorySelection(c.id)} aria-pressed={on}>
                        {on && <Icon name="check" size={14} strokeWidth={2.6} />}
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="ucpnb-sheet-footer">
              <button className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-lg ucpnb-btn-block" onClick={saveCategoryPrefs} disabled={prefsLoading}>
                Save
              </button>
            </div>
          </div>
        </div>
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
          shared={editor.shared}
          onSaved={() => handleSaved(Boolean(editor.notice))}
          onClose={() => setEditor(null)}
          onNeedsUnlock={() => setShowUnlock(true)}
        />
      )}

      {showUnlock && (
        <UnlockPrompt
          token={user.token}
          firstTime={!hasPin}
          onUnlocked={(deviceToken) => {
            setHasPin(true);
            handleUnlocked(deviceToken);
          }}
          onClose={() => setShowUnlock(false)}
        />
      )}
    </div>
  );
}
