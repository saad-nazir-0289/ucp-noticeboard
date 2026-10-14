import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AnalyticsSummary, AuthUser } from "../types";
import { AdminPinPrompt } from "./AdminPinPrompt";

interface Props {
  user: AuthUser;
  adminPin: string | null;
  onAdminPinChange: (pin: string | null) => void;
}

export function AnalyticsPanel({ user, adminPin, onAdminPinChange }: Props) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!adminPin || summary) return;
    api
      .getAnalyticsSummary(adminPin, user.token)
      .then(setSummary)
      .catch(() => {
        // Most likely the PIN changed since it was unlocked — ask again.
        onAdminPinChange(null);
        setError("Could not load analytics.");
      });
  }, [user, adminPin]);

  if (!adminPin) {
    return (
      <AdminPinPrompt
        section="Analytics"
        onUnlock={async (pin) => {
          setSummary(await api.getAnalyticsSummary(pin, user.token));
          setError(null);
          onAdminPinChange(pin);
        }}
      />
    );
  }
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
