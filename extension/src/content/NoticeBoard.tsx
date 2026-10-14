import { useEffect, useState } from "react";
import type { AuthUser, Category, Notice } from "@shared/types";
import { api } from "@shared/api/client";
import { findStudentIdentity } from "./studentIdentity";
import { PWA_BASE_URL } from "./pwaUrl";
import { NoticeFeed } from "../components/NoticeFeed";
import { NoticeManager } from "../components/NoticeManager";
import { AdminPanel } from "../components/AdminPanel";
import { AnalyticsPanel } from "../components/AnalyticsPanel";
import { Icon, type IconName } from "@shared/components/Icon";
import { EmptyState } from "@shared/components/EmptyState";

const REVIEW_URL = "https://chromewebstore.google.com/detail/dmkdgckajefikfbbfblihmnamjiaemfg?utm_source=item-share-cb";

type Tab = "feed" | "myNotices" | "allNotices" | "users" | "analytics";
type Status = "loading" | "ready" | "identity-not-found" | "error";

export function NoticeBoard() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [tab, setTab] = useState<Tab>("feed");
  // The Admin's PIN once they've unlocked an Admin section — memory only,
  // shared by Manage Users and Analytics so it's asked once per visit.
  const [adminPin, setAdminPin] = useState<string | null>(null);

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
            The dashboard layout may have changed — NoticeBoard needs a small update to read it.
          </EmptyState>
        ) : (
          <EmptyState icon="inbox" title="Can't reach NoticeBoard right now">
            Notices will be back shortly. Try reloading the page in a minute.
          </EmptyState>
        )}
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: IconName }[] = [
    { id: "feed", label: "Notices", icon: "megaphone" },
    ...(user.role === "Publisher" ? [{ id: "myNotices" as Tab, label: "My notices", icon: "fileText" as IconName }] : []),
    ...(user.role === "Admin"
      ? [
          { id: "allNotices" as Tab, label: "All notices", icon: "fileText" as IconName },
          { id: "users" as Tab, label: "Users", icon: "users" as IconName },
          { id: "analytics" as Tab, label: "Analytics", icon: "chart" as IconName },
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
                <Icon name={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </nav>
        )}
        <a
          className="ucpnb-icon-btn"
          href={`${PWA_BASE_URL}/?enableNotifications=1`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Get notifications on your phone"
          title="Get notifications — opens the NoticeBoard app, where they work"
        >
          <Icon name="bell" size={19} />
        </a>
        <a className="ucpnb-icon-btn" href={REVIEW_URL} target="_blank" rel="noopener noreferrer" aria-label="Send feedback" title="Send feedback">
          <Icon name="message" size={19} />
        </a>
      </PanelHeader>

      {tab === "feed" && (
        <NoticeFeed token={user.token} initialNotices={bootstrapNotices} initialCategories={bootstrapCategories} />
      )}
      {tab === "myNotices" && user.role === "Publisher" && <NoticeManager user={user} scope="mine" />}
      {tab === "allNotices" && user.role === "Admin" && <NoticeManager user={user} scope="all" />}
      {tab === "users" && user.role === "Admin" && (
        <AdminPanel user={user} adminPin={adminPin} onAdminPinChange={setAdminPin} />
      )}
      {tab === "analytics" && user.role === "Admin" && (
        <AnalyticsPanel user={user} adminPin={adminPin} onAdminPinChange={setAdminPin} />
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
          <span>Campus notices</span>
        </div>
      </div>
      {children && <div className="ucpnb-panel-actions">{children}</div>}
    </div>
  );
}
