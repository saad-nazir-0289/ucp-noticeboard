import { useEffect, useState } from "react";
import { api } from "@shared/api/client";
import type { AnalyticsSummary, AnalyticsTotals, AuthUser } from "@shared/types";
import { AdminPinPrompt } from "./AdminPinPrompt";
import { Icon, type IconName } from "@shared/components/Icon";
import { PinnedBadge } from "@shared/components/Tags";
import { timeAgo } from "@shared/format";
import { uninstallReasonLabel } from "@shared/uninstallReasons";
import { BarList, ColumnChart, DataTable, LineChart, SegmentedBar } from "./charts";

interface Props {
  user: AuthUser;
  /** Whether this Chrome is unlocked (the device token replaces the PIN). */
  unlocked: boolean;
  onUnlock: (pin: string) => Promise<void>;
}

const RANGES = [7, 30, 90] as const;

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const longDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
const percent = (part: number, whole: number) => (whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`);

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="ucpnb-viz-card">
      <div className="ucpnb-section-header">
        <div>
          <h4>{title}</h4>
          {note && <p>{note}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function AnalyticsPanel({ user, unlocked, onUnlock }: Props) {
  const [days, setDays] = useState<number>(30);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    let current = true;
    setLoading(true);
    api
      .getAnalyticsSummary("", user.token, days)
      .then((s) => {
        if (!current) return;
        setSummary(s);
        setError(null);
      })
      .catch(() => current && setError("Could not load analytics."))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [user, unlocked, days]);

  if (!unlocked) {
    return <AdminPinPrompt title="Enter your PIN to open Analytics" onUnlock={onUnlock} />;
  }
  if (error && !summary) return <p className="ucpnb-form-error">{error}</p>;
  if (!summary) return <div className="ucpnb-skeleton" style={{ height: 160, borderRadius: 16 }} />;

  const s = summary;
  const range = `last ${s.rangeDays} days`;
  const dayKeys = s.days.map((d) => d.day);
  // Visits and opens are only counted per day from trackingSince on: a
  // comparison with a period before that would be meaningless.
  const firstDay = s.days[0]?.day ?? "";
  const previousFirstDay = (() => {
    if (!firstDay) return "";
    const d = new Date(`${firstDay}T00:00:00`);
    d.setDate(d.getDate() - s.rangeDays);
    return d.toISOString().slice(0, 10);
  })();
  const trackedBefore = s.trackingSince !== null && s.trackingSince <= previousFirstDay;
  // Where the per-day counting starts within the range (0: before it).
  const trackedFrom = s.trackingSince === null ? dayKeys.length - 1 : Math.max(0, dayKeys.indexOf(s.trackingSince));
  const trackingNote =
    s.trackingSince === null
      ? "Counting starts with the next visit."
      : s.trackingSince > firstDay
        ? `Counted from ${dayLabel(s.trackingSince)}; there's nothing to show before that.`
        : undefined;

  const delta = (key: keyof AnalyticsTotals, tracked = true) => {
    if (!tracked) return null;
    const now = s.current[key];
    const before = s.previous[key];
    if (before === 0) return now === 0 ? null : { text: "new this period", up: true };
    const change = Math.round(((now - before) / before) * 100);
    return { text: `${change > 0 ? "+" : ""}${change}% vs previous ${s.rangeDays} days`, up: change >= 0 };
  };

  const tiles: { label: string; value: number | string; icon: IconName; delta?: { text: string; up: boolean } | null; hint?: string }[] = [
    { label: "People", value: s.totalUsers, icon: "users", hint: `${s.current.newUsers.toLocaleString()} new in the ${range}` },
    { label: "Active today", value: s.activeToday, icon: "sparkles" },
    { label: `Active, ${range}`, value: s.activeInRange, icon: "users", hint: `${percent(s.activeInRange, s.totalUsers)} of everyone` },
    { label: "New people", value: s.current.newUsers, icon: "plus", delta: delta("newUsers") },
    { label: "Dashboard and app opens", value: s.current.visits, icon: "eye", delta: delta("visits", trackedBefore) },
    { label: "Notice opens", value: s.current.opens, icon: "fileText", delta: delta("opens", trackedBefore) },
    { label: "Notices posted", value: s.current.noticesPosted, icon: "megaphone", delta: delta("noticesPosted") },
    { label: "Phones with notifications", value: s.notifications.devices, icon: "bell", hint: `${s.notifications.newInRange.toLocaleString()} turned on in the ${range}` },
  ];

  const hours = s.visitsByHour.map((value, h) => ({ key: String(h), label: h % 6 === 0 ? hourLabel(h) : "", long: `${hourLabel(h)} to ${hourLabel((h + 1) % 24)}`, value }));
  const busiest = s.visitsByHour.reduce((best, v, h) => (v > s.visitsByHour[best] ? h : best), 0);
  const columns = (key: "newUsers" | "noticesPosted" | "opens" | "archives") =>
    s.days.map((d) => ({ key: d.day, label: dayLabel(d.day), long: longDay(d.day), value: d[key] }));
  const columnEvery = s.rangeDays <= 7 ? 1 : s.rangeDays <= 30 ? 7 : 15;

  return (
    <div className={`ucpnb-tab-panel ucpnb-viz${loading ? " is-loading" : ""}`}>
      <div className="ucpnb-viz-toolbar">
        <div>
          <h4>Analytics</h4>
          <p>Totals only: nothing here shows what any one person did.</p>
        </div>
        <nav className="ucpnb-segmented" aria-label="Period">
          {RANGES.map((r) => (
            <button key={r} className={days === r ? "is-active" : ""} aria-pressed={days === r} onClick={() => setDays(r)}>
              {r} days
            </button>
          ))}
        </nav>
      </div>
      {error && <p className="ucpnb-form-error">{error}</p>}

      <div className="ucpnb-stats-grid ucpnb-viz-tiles">
        {tiles.map((t) => (
          <div className="ucpnb-stat" key={t.label}>
            <span className="ucpnb-stat-icon">
              <Icon name={t.icon} size={18} />
            </span>
            <span className="ucpnb-stat-value">{typeof t.value === "number" ? t.value.toLocaleString() : t.value}</span>
            <span className="ucpnb-stat-label">{t.label}</span>
            {t.delta && (
              <span className={`ucpnb-viz-delta ${t.delta.up ? "is-up" : "is-down"}`}>
                <span aria-hidden="true">{t.delta.up ? "▲" : "▼"}</span> {t.delta.text}
              </span>
            )}
            {t.hint && <span className="ucpnb-field-hint">{t.hint}</span>}
          </div>
        ))}
      </div>

      <div className="ucpnb-viz-grid">
        <Section title="People each day" note={trackingNote ?? `Everyone who opened NoticeBoard that day, counted once.`}>
          <LineChart days={dayKeys} from={trackedFrom} series={[{ key: "visitors", label: "people", color: "var(--viz-1)" }]} values={{ visitors: s.days.map((d) => d.visitors) }} />
          <DataTable head={["Day", "People", "Opens"]} rows={s.days.map((d) => [longDay(d.day), d.visitors, d.visits])} />
        </Section>

        <Section title="Extension or web app" note="People each day, by where they opened NoticeBoard. Someone using both counts in each.">
          <LineChart
            days={dayKeys}
            from={trackedFrom}
            series={[
              { key: "extension", label: "Extension", color: "var(--viz-1)" },
              { key: "app", label: "Web app", color: "var(--viz-2)" },
            ]}
            values={{ extension: s.days.map((d) => d.visitorsExtension), app: s.days.map((d) => d.visitorsApp) }}
          />
          <DataTable head={["Day", "Extension", "Web app"]} rows={s.days.map((d) => [longDay(d.day), d.visitorsExtension, d.visitorsApp])} />
        </Section>

        <Section title="New people" note="First sign-in, by day.">
          <ColumnChart items={columns("newUsers")} label="new people" every={columnEvery} />
          <DataTable head={["Day", "New people"]} rows={s.days.map((d) => [longDay(d.day), d.newUsers])} />
        </Section>

        <Section title="Notice opens" note={trackingNote ?? "Every time a notice is opened, by day."}>
          <ColumnChart items={columns("opens")} label="opens" every={columnEvery} />
          <DataTable head={["Day", "Opens"]} rows={s.days.map((d) => [longDay(d.day), d.opens])} />
        </Section>

        <Section title="Notices posted" note="By day, including any later deleted.">
          <ColumnChart items={columns("noticesPosted")} label="notices" every={columnEvery} />
          <DataTable head={["Day", "Notices"]} rows={s.days.map((d) => [longDay(d.day), d.noticesPosted])} />
        </Section>

        <Section
          title="Busiest hours"
          note={s.visitsByHour.some((v) => v > 0) ? `Opens by hour, Pakistan time. Busiest: ${hourLabel(busiest)} to ${hourLabel((busiest + 1) % 24)}.` : "Opens by hour, Pakistan time."}
        >
          <ColumnChart items={hours} label="opens" />
          <DataTable head={["Hour", "Opens"]} rows={hours.map((h) => [h.long, h.value])} />
        </Section>

        <Section title="Where people use it" note={`People active in the ${range}.`}>
          <SegmentedBar
            unit="people"
            parts={[
              { label: "Extension only", value: s.audience.extensionOnly, color: "var(--viz-1)" },
              { label: "Web app only", value: s.audience.appOnly, color: "var(--viz-2)" },
              { label: "Both", value: s.audience.both, color: "var(--viz-3)" },
            ]}
          />
        </Section>

        <Section
          title="How often people come back"
          note={`Everyone who has signed in. ${s.audience.dormant.toLocaleString()} haven't opened it in over 30 days.`}
        >
          <SegmentedBar
            unit="people"
            parts={[
              { label: "Came back", value: s.audience.returning, color: "var(--viz-1)" },
              { label: "Opened once", value: s.audience.oneTime, color: "var(--viz-2)" },
              { label: "Never opened", value: s.audience.neverOpened, color: "var(--viz-3)" },
            ]}
          />
        </Section>
      </div>

      <Section title="Notices" note={`Posted in the ${range}, and what's on the board now.`}>
        <div className="ucpnb-stats-grid ucpnb-viz-tiles">
          {[
            { label: "On the board now", value: s.notices.live },
            { label: "Pinned", value: s.notices.pinned },
            { label: "In the bin", value: s.notices.inBin },
            { label: "Average opens per notice", value: s.notices.averageOpens },
            { label: "With a poster", value: percent(s.notices.withPoster, s.notices.postedInRange) },
            { label: "With a deadline", value: percent(s.notices.withDeadline, s.notices.postedInRange) },
            { label: "With a link", value: percent(s.notices.withLink, s.notices.postedInRange) },
            { label: "Archived by students", value: s.current.archives },
          ].map((t) => (
            <div className="ucpnb-stat" key={t.label}>
              <span className="ucpnb-stat-value">{typeof t.value === "number" ? t.value.toLocaleString() : t.value}</span>
              <span className="ucpnb-stat-label">{t.label}</span>
            </div>
          ))}
        </div>
      </Section>

      <div className="ucpnb-viz-grid">
        <Section title="Categories by opens" note={`Opens of notices posted in the ${range}.`}>
          <BarList
            items={s.categories.map((c) => ({
              key: String(c.id ?? "none"),
              label: c.name,
              value: c.opens,
              note: `${c.posted} posted · ${c.live} on the board`,
            }))}
          />
          <DataTable head={["Category", "Opens", "Posted", "On the board", "Notification picks"]} rows={s.categories.map((c) => [c.name, c.opens, c.posted, c.live, c.subscribers])} />
        </Section>

        <Section
          title="Notifications"
          note={
            s.notifications.devices === 0
              ? undefined
              : `${s.notifications.devices.toLocaleString()} phones from ${s.notifications.people.toLocaleString()} people. ${s.notifications.allTopics.toLocaleString()} get everything; ${s.notifications.choseTopics.toLocaleString()} picked topics.`
          }
        >
          {s.notifications.choseTopics === 0 ? (
            <p className="ucpnb-field-hint">
              {s.notifications.devices === 0 ? "No one has turned notifications on yet." : "Nobody has picked topics: every phone gets every notice."}
            </p>
          ) : (
            <BarList
              color="var(--viz-2)"
              items={s.categories.filter((c) => c.id !== null).map((c) => ({ key: String(c.id), label: c.name, value: c.subscribers })).sort((a, b) => b.value - a.value)}
            />
          )}
        </Section>
      </div>

      <Section title="Most opened" note={`Notices posted in the ${range}, by how often they were opened.`}>
        {s.topNotices.length === 0 ? (
          <p className="ucpnb-field-hint">Nothing posted in the {range}.</p>
        ) : (
          <ol className="ucpnb-manage-list">
            {s.topNotices.map((n, i) => (
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
      </Section>

      <Section title="Publishers" note={`Who's posting, most recently active first. Counts are for the ${range}.`}>
        {s.publishers.length === 0 ? (
          <p className="ucpnb-field-hint">No publishers yet. Add one under Users.</p>
        ) : (
          <ul className="ucpnb-manage-list">
            {s.publishers.map((p) => {
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
                    <span className="ucpnb-badge ucpnb-badge-closed">Quiet this period</span>
                  ) : (
                    <span className="ucpnb-activity-count">
                      {p.noticesLast30Days} posted · <Icon name="eye" size={14} /> {p.viewsLast30Days.toLocaleString()}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Why people removed the extension" note="Anonymous answers from the page Chrome opens after someone uninstalls it, last 90 days.">
        {s.uninstallReasons.length === 0 ? (
          <p className="ucpnb-field-hint">No answers yet.</p>
        ) : (
          <>
            <BarList
              color="var(--viz-2)"
              items={s.uninstallReasons.map((r) => ({ key: r.reason, label: uninstallReasonLabel(r.reason), value: r.count }))}
            />
            {s.uninstallComments.length > 0 && (
              <ul className="ucpnb-manage-list">
                {s.uninstallComments.map((c, i) => (
                  <li key={`c${i}`} className="ucpnb-manage-row">
                    <div className="ucpnb-manage-info">
                      <strong>"{c.comment}"</strong>
                      <span className="ucpnb-manage-meta">
                        {uninstallReasonLabel(c.reason)} · {timeAgo(c.createdAt)}
                        {c.extensionVersion ? ` · version ${c.extensionVersion}` : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
