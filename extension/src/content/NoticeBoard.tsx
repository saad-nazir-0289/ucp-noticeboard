import { useEffect, useRef, useState } from "react";
import type { AuthUser, Category, Notice } from "@shared/types";
import { api, setDeviceToken } from "@shared/api/client";
import { clearDeviceToken, loadDeviceToken, saveDeviceToken } from "./deviceUnlock";
import { AdminPinPrompt } from "../components/AdminPinPrompt";
import { findStudentIdentity } from "./studentIdentity";
import { PWA_BASE_URL } from "./pwaUrl";
import { NoticeFeed } from "../components/NoticeFeed";
import { NoticeManager } from "../components/NoticeManager";
import { AdminPanel } from "../components/AdminPanel";
import { AnalyticsPanel } from "../components/AnalyticsPanel";
import { Icon } from "@shared/components/Icon";
import { EmptyState } from "@shared/components/EmptyState";

const REVIEW_URL = "https://chromewebstore.google.com/detail/dmkdgckajefikfbbfblihmnamjiaemfg?utm_source=item-share-cb";

type Tab = "feed" | "myNotices" | "allNotices" | "users" | "analytics";
type Status = "loading" | "ready" | "identity-not-found" | "error";

export function NoticeBoard() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [tab, setTab] = useState<Tab>("feed");
  // Publishers and Admins enter their PIN once per computer; after that
  // this Chrome is "unlocked" (content/deviceUnlock.ts) for every action.
  const [unlocked, setUnlocked] = useState(false);
  const [askingPin, setAskingPin] = useState(false);
  const pendingUnlock = useRef<((ok: boolean) => void) | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Bundled in the /login response — lets the feed render on the very
  // first paint without waiting on a second network round trip.
  const [bootstrapNotices, setBootstrapNotices] = useState<Notice[]>([]);
  const [bootstrapCategories, setBootstrapCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function identify() {
      const identity = findStudentIdentity();
      if (!identity) {
        if (!cancelled) setStatus("identity-not-found");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const activationCode = params.get("ucpnb_activate") ?? undefined;
      if (activationCode) {
        params.delete("ucpnb_activate");
        const cleanUrl =
          window.location.pathname +
          (params.toString() ? `?${params.toString()}` : "") +
          window.location.hash;
        window.history.replaceState({}, "", cleanUrl);
      }

      let loggedInUser: AuthUser;
      try {
        const result = await api.login(identity.rollNumber, identity.name, activationCode);
        loggedInUser = result;
        setBootstrapNotices(result.notices);
        setBootstrapCategories(result.categories);
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }

      if (cancelled) return;
      if (loggedInUser.role !== "Student") {
        const saved = await loadDeviceToken(loggedInUser.rollNumber);
        if (saved && !cancelled) {
          setDeviceToken(saved, forgetUnlock);
          setUnlocked(true);
        }
      }
      setUser(loggedInUser);
      setStatus("ready");

      api.recordVisit(loggedInUser.token).catch(() => {
        /* non-critical: don't block the UI if this fails */
      });
    }

    identify();
    return () => {
      cancelled = true;
    };
  }, []);

  // The server stopped accepting this Chrome's unlock (expired, revoked,
  // PIN reset): forget it, so the next action asks for the PIN again.
  function forgetUnlock() {
    clearDeviceToken();
    setUnlocked(false);
  }

  const unlockWithPin = async (pin: string) => {
    if (!user) return;
    const result = await api.unlockDevice(pin, user.token, "Chrome extension");
    setDeviceToken(result.deviceToken, forgetUnlock);
    await saveDeviceToken(user.rollNumber, result.deviceToken);
    setUnlocked(true);
  };

  const finishUnlock = (ok: boolean) => {
    setAskingPin(false);
    pendingUnlock.current?.(ok);
    pendingUnlock.current = null;
  };

  const ensureUnlocked = () => {
    if (unlocked) return Promise.resolve(true);
    setAskingPin(true);
    return new Promise<boolean>((resolve) => {
      pendingUnlock.current = resolve;
    });
  };

  const lock = async () => {
    setMenuOpen(false);
    if (user) {
      try {
        const current = (await api.getMyDevices(user.token)).find((d) => d.isCurrent);
        if (current) await api.revokeMyDevice(current.id, user.token);
      } catch {
        /* forgetting it here is what matters on this computer */
      }
    }
    setDeviceToken(null);
    forgetUnlock();
  };

  if (status === "loading") {
    return (
      <div className="ucpnb-panel-root">
        <PanelHeader />
        <div className="ucpnb-carousel">
          {[0, 1, 2, 3].map((i) => (
            <div className="ucpnb-card ucpnb-card-skeleton" key={i}>
              <div className="ucpnb-skeleton ucpnb-card-media" style={{ borderRadius: 0 }} />
              <div className="ucpnb-card-body">
                <div className="ucpnb-skeleton" style={{ width: "35%", height: 18 }} />
                <div className="ucpnb-skeleton" style={{ width: "90%", height: 16 }} />
                <div className="ucpnb-skeleton" style={{ width: "100%", height: 12 }} />
                <div className="ucpnb-skeleton" style={{ width: "60%", height: 12 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (status === "identity-not-found" || status === "error" || !user) {
    return (
      <div className="ucpnb-panel-root">
        <PanelHeader />
        {status === "identity-not-found" ? (
          <EmptyState icon="users" title="Couldn't find your Roll Number">
            The dashboard layout may have changed. NoticeBoard needs a small update to read it.
          </EmptyState>
        ) : (
          <EmptyState icon="inbox" title="Can't reach NoticeBoard right now">
            Notices will be back shortly. Try reloading the page in a minute.
          </EmptyState>
        )}
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "feed", label: "Notices" },
    ...(user.role === "Publisher" ? [{ id: "myNotices" as Tab, label: "My notices" }] : []),
    ...(user.role === "Admin"
      ? [
          { id: "allNotices" as Tab, label: "All notices" },
          { id: "users" as Tab, label: "Users" },
          { id: "analytics" as Tab, label: "Analytics" },
        ]
      : []),
  ];

  return (
    <div className="ucpnb-panel-root">
      <PanelHeader>
        {tabs.length > 1 && (
          <nav className="ucpnb-segmented ucpnb-tabs" aria-label="NoticeBoard sections">
            {tabs.map((t) => (
              <button key={t.id} className={tab === t.id ? "is-active" : ""} onClick={() => setTab(t.id)} aria-current={tab === t.id}>
                {t.label}
              </button>
            ))}
          </nav>
        )}
        <MoreMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <a className="ucpnb-more-item" href={`${PWA_BASE_URL}/?enableNotifications=1`} target="_blank" rel="noopener noreferrer">
            <Icon name="bell" size={17} />
            Notifications on your phone
          </a>
          <a className="ucpnb-more-item" href={REVIEW_URL} target="_blank" rel="noopener noreferrer">
            <Icon name="message" size={17} />
            Send feedback
          </a>
          {unlocked && (
            <button className="ucpnb-more-item" onClick={lock}>
              <Icon name="lock" size={17} />
              Lock posting on this computer
            </button>
          )}
        </MoreMenu>
      </PanelHeader>

      {tab === "feed" && (
        <NoticeFeed token={user.token} initialNotices={bootstrapNotices} initialCategories={bootstrapCategories} />
      )}
      {tab === "myNotices" && user.role === "Publisher" && <NoticeManager user={user} scope="mine" ensureUnlocked={ensureUnlocked} />}
      {tab === "allNotices" && user.role === "Admin" && <NoticeManager user={user} scope="all" ensureUnlocked={ensureUnlocked} />}
      {tab === "users" && user.role === "Admin" && <AdminPanel user={user} unlocked={unlocked} onUnlock={unlockWithPin} />}
      {tab === "analytics" && user.role === "Admin" && <AnalyticsPanel user={user} unlocked={unlocked} onUnlock={unlockWithPin} />}

      {askingPin && (
        <div className="ucpnb-overlay" onClick={() => finishUnlock(false)}>
          <div className="ucpnb-sheet ucpnb-sheet-pin" role="dialog" aria-modal="true" aria-label="Enter your PIN" onClick={(e) => e.stopPropagation()}>
            <AdminPinPrompt
              title="Enter your PIN to continue"
              onUnlock={async (pin) => {
                await unlockWithPin(pin);
                finishUnlock(true);
              }}
              onCancel={() => finishUnlock(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** The header's "⋯" menu: the less-used links, kept out of the way. */
function MoreMenu({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: Event) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onOpenChange(false);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div className="ucpnb-more" ref={rootRef}>
      <button className="ucpnb-icon-btn" onClick={() => onOpenChange(!open)} aria-haspopup="menu" aria-expanded={open} aria-label="More" title="More">
        <Icon name="more" size={19} />
      </button>
      {open && (
        <div className="ucpnb-more-list" role="menu" onClick={() => onOpenChange(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

function PanelHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="ucpnb-panel-header">
      <div className="ucpnb-brand">
        <span className="ucpnb-logo">
          <Icon name="megaphone" size={17} />
        </span>
        <div className="ucpnb-brand-text">
          <strong>NoticeBoard</strong>
        </div>
      </div>
      {children && <div className="ucpnb-panel-actions">{children}</div>}
    </div>
  );
}
