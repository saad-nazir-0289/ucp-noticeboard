import { useEffect, useState } from "react";
import type { AuthUser } from "../types";
import { api } from "../api/client";
import { findStudentIdentity } from "./studentIdentity";
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

  useEffect(() => {
    let cancelled = false;

    async function identify() {
      // Deliberately NOT cached in chrome.storage.local across page loads.
      // Roles can change at any time (Admin promotes/demotes someone), and
      // a stale cached session would keep showing the OLD role/tabs until
      // someone manually cleared extension storage. Re-identifying every
      // page load is cheap (one lightweight request) and guarantees the
      // UI always reflects your current role.
      const identity = findStudentIdentity();
      if (!identity) {
        if (!cancelled) setStatus("identity-not-found");
        return;
      }

      let loggedInUser: AuthUser;
      try {
        loggedInUser = await api.login(identity.rollNumber, identity.name);
      } catch {
        if (!cancelled) setStatus("error");
        return;
      }

      if (cancelled) return;
      setUser(loggedInUser);
      setStatus("ready");

      // Counted every page load — this is what "views"/"visitors" in the
      // Admin analytics tab are based on.
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
      </div>

      {tab === "feed" && <NoticeFeed token={user.token} />}
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
