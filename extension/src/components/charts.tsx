import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";

// Small, dependency-free charts for the Admin's Analytics (AnalyticsPanel).
// Colours come from CSS variables on .ucpnb-viz (content.css), stepped for
// light and dark; text always uses the panel's own text colours. Every chart
// has a hover/focus readout and a table view, so no value depends on colour
// or on hovering.

export interface Series {
  key: string;
  label: string;
  /** A CSS colour, normally var(--viz-1) / var(--viz-2) / var(--viz-3). */
  color: string;
}

/** The element's width in pixels, kept up to date: charts draw at their real size, so text never stretches. */
function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

const PAD = { top: 12, right: 12, bottom: 22, left: 34 };

/** 0, then two clean steps up to at least `max`. */
function ticks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 2;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const clean = Math.max(1, step);
  return [0, clean, clean * 2];
}

const compact = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}K` : n.toLocaleString());

const dayLabel = (iso: string, withWeekday = false) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", withWeekday ? { weekday: "short", day: "numeric", month: "short" } : { day: "numeric", month: "short" });

function Tooltip({ x, children }: { x: number; children: ReactNode }) {
  // x: 0..1 across the chart; kept inside the box.
  const left = `clamp(0px, calc(${(x * 100).toFixed(2)}% - 75px), calc(100% - 150px))`;
  return (
    <div className="ucpnb-viz-tip" style={{ left }} role="status">
      {children}
    </div>
  );
}

/** A table with the same numbers, behind a toggle. */
export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="ucpnb-viz-table">
      <summary>Show as a table</summary>
      <div className="ucpnb-viz-table-scroll">
        <table>
          <thead>
            <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{typeof c === "number" ? c.toLocaleString() : c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Lines over the days of the range, with a crosshair readout. One series gets a soft area under it. */
export function LineChart({
  days,
  series,
  values,
  height = 180,
  from = 0,
}: {
  days: string[];
  series: Series[];
  /** values[seriesKey][dayIndex] */
  values: Record<string, number[]>;
  height?: number;
  /** The first day with data (counting started then): the lines start there, not as a run of zeros before it. */
  from?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [plot, W] = useWidth<HTMLDivElement>();
  const box = useRef<SVGSVGElement>(null);
  const gradient = useId();
  const max = Math.max(0, ...series.flatMap((s) => values[s.key] ?? []));
  const yTicks = ticks(max);
  const top = yTicks[yTicks.length - 1];
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (days.length <= 1 ? innerW / 2 : (i / (days.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || days.length === 0) return;
    const units = clientX - rect.left;
    const i = Math.round(((units - PAD.left) / innerW) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  };
  const labelAt = [0, Math.floor((days.length - 1) / 2), days.length - 1];

  return (
    <div className="ucpnb-viz-frame">
      {series.length > 1 && (
        <div className="ucpnb-viz-legend">
          {series.map((s) => (
            <span key={s.key}>
              <i className="ucpnb-viz-key-line" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="ucpnb-viz-plot" ref={plot}>
        <svg
          ref={box}
          viewBox={`0 0 ${W} ${height}`}
          width={W}
          height={height}
          className="ucpnb-viz-svg"
          tabIndex={0}
          role="img"
          aria-label={`${series.map((s) => s.label).join(" and ")}, ${days.length} days`}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? days.length) - 1));
            if (e.key === "ArrowRight") setHover((h) => Math.min(days.length - 1, (h ?? -1) + 1));
          }}
        >
          {series.length === 1 && (
            <defs>
              <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={series[0].color} stopOpacity="0.14" />
                <stop offset="1" stopColor={series[0].color} stopOpacity="0.02" />
              </linearGradient>
            </defs>
          )}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="ucpnb-viz-gridline" />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="ucpnb-viz-axis">
                {compact(t)}
              </text>
            </g>
          ))}
          {labelAt.filter((i, n, all) => all.indexOf(i) === n && days[i]).map((i) => (
            <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} className="ucpnb-viz-axis">
              {dayLabel(days[i])}
            </text>
          ))}
          {series.map((s) => {
            const start = Math.max(0, Math.min(from, days.length - 1));
            const pts = (values[s.key] ?? []).map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).slice(start);
            return (
              <g key={s.key}>
                {series.length === 1 && pts.length > 1 && (
                  <polygon
                    points={`${x(start)},${y(0)} ${pts.join(" ")} ${x(days.length - 1)},${y(0)}`}
                    fill={`url(#${gradient})`}
                  />
                )}
                {pts.length === 1 && <circle cx={x(start)} cy={y(values[s.key]?.[start] ?? 0)} r={4} fill={s.color} />}
                <polyline points={pts.join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="ucpnb-viz-crosshair" />
          )}
        </svg>
        {hover !== null &&
          series.map((s) => (
            <span
              key={s.key}
              className="ucpnb-viz-dot"
              style={{ left: x(hover), top: y(values[s.key]?.[hover] ?? 0), background: s.color }}
            />
          ))}
        {hover !== null && (
          <Tooltip x={x(hover) / W}>
            <span className="ucpnb-viz-tip-title">{dayLabel(days[hover], true)}</span>
            {series.map((s) => (
              <span key={s.key} className="ucpnb-viz-tip-row">
                <i className="ucpnb-viz-key-line" style={{ background: s.color }} />
                <b>{(values[s.key]?.[hover] ?? 0).toLocaleString()}</b> {s.label}
              </span>
            ))}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Columns, one per item (days or hours), each with its own hover readout. */
export function ColumnChart({
  items,
  label,
  color = "var(--viz-1)",
  height = 150,
  every = 1,
}: {
  items: { key: string; label: string; long?: string; value: number }[];
  /** What a value is, for the readout ("new people"). */
  label: string;
  color?: string;
  height?: number;
  /** Label every nth column under the axis, counting back from the last one. */
  every?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [plot, W] = useWidth<HTMLDivElement>();
  const max = Math.max(0, ...items.map((i) => i.value));
  const yTicks = ticks(max);
  const top = yTicks[yTicks.length - 1];
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, items.length);
  const barW = Math.min(24, Math.max(2, slot - 2));
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;

  return (
    <div className="ucpnb-viz-frame">
      <div className="ucpnb-viz-plot" ref={plot}>
        <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} className="ucpnb-viz-svg" role="img" aria-label={label}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="ucpnb-viz-gridline" />
              <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="ucpnb-viz-axis">
                {compact(t)}
              </text>
            </g>
          ))}
          {items.map((item, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const h = Math.max(0, (item.value / top) * innerH);
            const r = Math.min(4, barW / 2, h);
            const x0 = cx - barW / 2;
            const yTop = PAD.top + innerH - h;
            // Rounded at the data end, square on the baseline.
            const d =
              h <= 0
                ? ""
                : `M${x0},${PAD.top + innerH} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${PAD.top + innerH} Z`;
            return (
              <g
                key={item.key}
                className="ucpnb-viz-col"
                tabIndex={0}
                aria-label={`${item.long ?? item.label}: ${item.value} ${label}`}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} fill="transparent" />
                {d && <path d={d} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />}
                {(items.length - 1 - i) % every === 0 && (
                  <text x={cx} y={height - 6} textAnchor="middle" className="ucpnb-viz-axis">
                    {item.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover !== null && items[hover] && (
          <Tooltip x={(PAD.left + slot * hover + slot / 2) / W}>
            <span className="ucpnb-viz-tip-title">{items[hover].long ?? items[hover].label}</span>
            <span className="ucpnb-viz-tip-row">
              <b>{items[hover].value.toLocaleString()}</b> {label}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** One whole split into parts, with a legend that carries every value. */
export function SegmentedBar({ parts, unit }: { parts: { label: string; value: number; color: string }[]; unit: string }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  return (
    <div className="ucpnb-viz-frame">
      <div className="ucpnb-viz-seg" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value} ${unit}`).join(", ")}>
        {total === 0 ? (
          <span className="ucpnb-viz-seg-empty" />
        ) : (
          parts
            .filter((p) => p.value > 0)
            .map((p) => <span key={p.label} style={{ flexGrow: p.value, background: p.color }} title={`${p.label}: ${p.value.toLocaleString()} ${unit}`} />)
        )}
      </div>
      <div className="ucpnb-viz-legend ucpnb-viz-legend-values">
        {parts.map((p) => (
          <span key={p.label}>
            <i className="ucpnb-viz-key-box" style={{ background: p.color }} />
            {p.label} <b>{p.value.toLocaleString()}</b>
            {total > 0 && <small>{Math.round((p.value / total) * 100)}%</small>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars, longest first, value at the tip. */
export function BarList({ items, color = "var(--viz-1)" }: { items: { key: string; label: string; value: number; note?: string }[]; color?: string }) {
  const max = useMemo(() => Math.max(1, ...items.map((i) => i.value)), [items]);
  return (
    <ul className="ucpnb-viz-bars">
      {items.map((item) => (
        <li key={item.key}>
          <span className="ucpnb-viz-bars-label">
            {item.label}
            {item.note && <small>{item.note}</small>}
          </span>
          <span className="ucpnb-viz-bars-track">
            <span style={{ width: `${(item.value / max) * 100}%`, background: color }} />
          </span>
          <b className="ucpnb-viz-bars-value">{item.value.toLocaleString()}</b>
        </li>
      ))}
    </ul>
  );
}
