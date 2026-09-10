import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AnalyticsSummary, AuthUser } from "../types";

interface Props {
  user: AuthUser;
}

export function AnalyticsPanel({ user }: Props) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAnalyticsSummary(user.token)
      .then(setSummary)
      .catch(() => setError("Could not load analytics."));
  }, [user]);

  if (error) return <p className="ucpnb-error">{error}</p>;
  if (!summary) return <p className="ucpnb-status">Loading...</p>;

  const stats: { label: string; value: number }[] = [
    { label: "Total users", value: summary.totalUsers },
    { label: "Students", value: summary.totalStudents },
    { label: "Publishers", value: summary.totalPublishers },
    { label: "Admins", value: summary.totalAdmins },
    { label: "Total dashboard views", value: summary.totalViews },
    { label: "Active in last 7 days", value: summary.activeLast7Days },
  ];

  return (
    <div className="ucpnb-panel">
      <h4>Usage Analytics</h4>
      <div className="ucpnb-stats-grid">
        {stats.map((s) => (
          <div className="ucpnb-stat-card" key={s.label}>
            <span className="ucpnb-stat-value">{s.value}</span>
            <span className="ucpnb-stat-label">{s.label}</span>
          </div>
        ))}
      </div>
      <p className="ucpnb-status">
        "Total dashboard views" counts every time any user's dashboard loaded the
        NoticeBoard, so it's higher than the user count once people revisit.
      </p>
    </div>
  );
}
