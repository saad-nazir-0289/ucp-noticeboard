import { useEffect, useState } from "react";
import type { AuthUser, Category, Notice } from "../types";
import { api } from "../api/client";
import { findStudentIdentity } from "./studentIdentity";
import { PWA_BASE_URL } from "./share";
import { NoticeFeed } from "../components/NoticeFeed";
import { NoticeManager } from "../components/NoticeManager";
import { AdminPanel } from "../components/AdminPanel";
import { AnalyticsPanel } from "../components/AnalyticsPanel";

type Tab = "feed" | "myNotices" | "allNotices" | "users" | "analytics";
type Status = "loading" | "ready" | "identity-not-found" | "error";

export function NoticeBoard() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [tab, setTab] = useState<Tab>("feed");

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

  if (status === "loading") return null;

  if (status === "identity-not-found") {
    return (
      <div className="ucpnb-section">
        <h3>Latest Updates</h3>
        <p className="ucpnb-error">
          Couldn't detect your Roll Number on this page. If the dashboard layout
          changed, this needs a small selector update.
        </p>
      </div>
    );
  }

  if (status === "error" || !user) {
    return (
      <div className="ucpnb-section">
        <h3>Latest Updates</h3>
        <p className="ucpnb-error">
          Couldn't reach the NoticeBoard server. Make sure the backend is running.
        </p>
      </div>
    );
  }

  return (
    <div className="ucpnb-section">
      <div className="ucpnb-header">
        <h3>Latest Updates</h3>
        <div className="ucpnb-header-actions">
          {(user.role === "Publisher" || user.role === "Admin") && (
            <nav className="ucpnb-tabs">
              <button
                className={tab === "feed" ? "ucpnb-tab active" : "ucpnb-tab"}
                onClick={() => setTab("feed")}
              >
                Notices
              </button>
              {user.role === "Publisher" && (
                <button
                  className={tab === "myNotices" ? "ucpnb-tab active" : "ucpnb-tab"}
                  onClick={() => setTab("myNotices")}
                >
                  My Notices
                </button>
              )}
              {user.role === "Admin" && (
                <>
                  <button
                    className={tab === "allNotices" ? "ucpnb-tab active" : "ucpnb-tab"}
                    onClick={() => setTab("allNotices")}
                  >
                    All Notices
                  </button>
                  <button
                    className={tab === "users" ? "ucpnb-tab active" : "ucpnb-tab"}
                    onClick={() => setTab("users")}
                  >
                    Manage Users
                  </button>
                  <button
                    className={tab === "analytics" ? "ucpnb-tab active" : "ucpnb-tab"}
                    onClick={() => setTab("analytics")}
                  >
                    Analytics
                  </button>
                </>
              )}
            </nav>
          )}
          <a
            className="ucpnb-btn"
            href={`${PWA_BASE_URL}/?enableNotifications=1`}
            target="_blank"
            rel="noopener noreferrer"
            title="Notifications aren't available inside the extension itself — this opens the mobile-friendly site, where they are"
          >
            🔔 Notifications
          </a>
        </div>
      </div>

      {tab === "feed" && (
        <NoticeFeed
          token={user.token}
          initialNotices={bootstrapNotices}
          initialCategories={bootstrapCategories}
        />
      )}
      {tab === "myNotices" && user.role === "Publisher" && (
        <NoticeManager user={user} scope="mine" />
      )}
      {tab === "allNotices" && user.role === "Admin" && (
        <NoticeManager user={user} scope="all" />
      )}
      {tab === "users" && user.role === "Admin" && <AdminPanel user={user} />}
      {tab === "analytics" && user.role === "Admin" && <AnalyticsPanel user={user} />}
    </div>
  );
}
