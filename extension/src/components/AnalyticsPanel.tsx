import { useEffect, useState } from "react";
import { api } from "@shared/api/client";
import type { AnalyticsSummary, AuthUser } from "@shared/types";
import { AdminPinPrompt } from "./AdminPinPrompt";
import { Icon, type IconName } from "@shared/components/Icon";
import { PinnedBadge } from "@shared/components/Tags";
import { timeAgo } from "@shared/format";

interface Props {
  user: AuthUser;
  /** Whether this Chrome is unlocked (the device token replaces the PIN). */
  unlocked: boolean;
  onUnlock: (pin: string) => Promise<void>;
}

export function AnalyticsPanel({ user, unlocked, onUnlock }: Props) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unlocked || summary) return;
    api
      .getAnalyticsSummary("", user.token)
      .then((s) => {
        setSummary(s);
        setError(null);
      })
      .catch(() => setError("Could not load analytics."));
  }, [user, unlocked]);

  if (!unlocked) {
    return <AdminPinPrompt title="Enter your PIN to open Analytics" onUnlock={onUnlock} />;
  }
  if (error) return <p className="ucpnb-form-error">{error}</p>;
  if (!summary) return <div className="ucpnb-skeleton" style={{ height: 160, borderRadius: 16 }} />;

  const stats: { label: string; value: number; icon: IconName; hint?: string }[] = [
    { label: "People", value: summary.totalUsers, icon: "users" },
    { label: "Active this week", value: summary.activeLast7Days, icon: "sparkles" },
    { label: "Dashboard views", value: summary.totalViews, icon: "eye", hint: "Every load, so repeat visits count" },
    { label: "Students", value: summary.totalStudents, icon: "users" },
    { label: "Publishers", value: summary.totalPublishers, icon: "megaphone" },
    { label: "Admins", value: summary.totalAdmins, icon: "lock" },
    { label: "Notices this month", value: summary.noticesLast30Days, icon: "fileText" },
  ];

  return (
    <div className="ucpnb-tab-panel">
      <div className="ucpnb-section-header">
        <div>
          <h4>Usage</h4>
          <p>How NoticeBoard is being used across campus.</p>
        </div>
      </div>
      <div className="ucpnb-stats-grid">
        {stats.map((s) => (
          <div className="ucpnb-stat" key={s.label}>
            <span className="ucpnb-stat-icon">
              <Icon name={s.icon} size={18} />
            </span>
            <span className="ucpnb-stat-value">{s.value.toLocaleString()}</span>
            <span className="ucpnb-stat-label">{s.label}</span>
            {s.hint && <span className="ucpnb-field-hint">{s.hint}</span>}
          </div>
        ))}
      </div>

      <div className="ucpnb-section-header">
        <div>
          <h4>Most opened</h4>
          <p>Notices posted in the last 30 days, by how often they were opened.</p>
        </div>
      </div>
      {summary.topNotices.length === 0 ? (
        <p className="ucpnb-field-hint">Nothing posted in the last 30 days.</p>
      ) : (
        <ol className="ucpnb-manage-list">
          {summary.topNotices.map((n, i) => (
            <li key={n.id} className="ucpnb-manage-row">
              <span className="ucpnb-rank">{i + 1}</span>
              <div className="ucpnb-manage-info">
                <strong>{n.title}</strong>
                <span className="ucpnb-manage-meta">
                  {n.isPinned && <PinnedBadge />}
                  {n.createdByName} · {timeAgo(n.createdAt)}
                </span>
              </div>
              <span className="ucpnb-activity-count">
                <Icon name="eye" size={14} /> {n.viewCount.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="ucpnb-section-header">
        <div>
          <h4>Publishers</h4>
          <p>Who's posting, most recently active first. Opens count every time a notice is opened.</p>
        </div>
      </div>
      {summary.publishers.length === 0 ? (
        <p className="ucpnb-field-hint">No publishers yet. Add one under Users.</p>
      ) : (
        <ul className="ucpnb-manage-list">
          {summary.publishers.map((p) => {
            const quiet = p.noticesLast30Days === 0;
            return (
              <li key={p.id} className="ucpnb-manage-row">
                <div className="ucpnb-manage-info">
                  <strong>{p.name}</strong>
                  <span className="ucpnb-manage-meta">
                    {p.lastPostedAt ? `Last posted ${timeAgo(p.lastPostedAt)}` : "Hasn't posted yet"}
                    {" · "}
                    {p.totalNotices} {p.totalNotices === 1 ? "notice" : "notices"} in total
                  </span>
                </div>
                {quiet ? (
                  <span className="ucpnb-badge ucpnb-badge-closed">Quiet this month</span>
                ) : (
                  <span className="ucpnb-activity-count">
                    {p.noticesLast30Days} this month · <Icon name="eye" size={14} /> {p.viewsLast30Days.toLocaleString()}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
