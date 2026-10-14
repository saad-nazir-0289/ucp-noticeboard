import { useEffect, useState } from "react";
import { api } from "@shared/api/client";
import type { AnalyticsSummary, AuthUser } from "@shared/types";
import { AdminPinPrompt } from "./AdminPinPrompt";
import { Icon, type IconName } from "@shared/components/Icon";

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
  if (error) return <p className="ucpnb-form-error">{error}</p>;
  if (!summary) return <div className="ucpnb-skeleton" style={{ height: 160, borderRadius: 16 }} />;

  const stats: { label: string; value: number; icon: IconName; hint?: string }[] = [
    { label: "People", value: summary.totalUsers, icon: "users" },
    { label: "Active this week", value: summary.activeLast7Days, icon: "sparkles" },
    { label: "Dashboard views", value: summary.totalViews, icon: "eye", hint: "Every load, so repeat visits count" },
    { label: "Students", value: summary.totalStudents, icon: "users" },
    { label: "Publishers", value: summary.totalPublishers, icon: "megaphone" },
    { label: "Admins", value: summary.totalAdmins, icon: "lock" },
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
    </div>
  );
}
