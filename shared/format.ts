/**
 * Human-friendly dates and the small visual decisions derived from a
 * notice's data (deadline urgency, category colour), shared by both apps
 * so a notice reads the same everywhere.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Just now", "12m ago", "3h ago", "Yesterday", "4d ago", then "Oct 12". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();
  if (diff < MINUTE) return "Just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY && startOfDay(then) === startOfDay(now)) return `${Math.floor(diff / HOUR)}h ago`;
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(then.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** "Monday, 14 October 2026 · 3:00 PM" style, for detail views. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

export type DeadlineTone = "urgent" | "soon" | "normal" | "closed";

/**
 * How pressing a deadline is: under a day is urgent (red), under four days
 * is soon (amber), past is closed. Labels are relative where that helps.
 */
export function deadlineStatus(iso: string, now: Date = new Date()): { label: string; tone: DeadlineTone } {
  const due = new Date(iso);
  const diff = due.getTime() - now.getTime();
  if (diff <= 0) return { label: "Closed", tone: "closed" };

  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY);
  if (days === 0) {
    const hours = Math.max(1, Math.ceil(diff / HOUR));
    return { label: hours <= 6 ? `${hours}h left` : "Due today", tone: "urgent" };
  }
  if (days === 1) return { label: "Due tomorrow", tone: diff < DAY ? "urgent" : "soon" };
  if (days < 4) return { label: `${days} days left`, tone: "soon" };
  return {
    label: `Due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    tone: "normal",
  };
}

/** A stable colour (0-7, see --nb-tone-N in tokens.css) for a category name. */
/**
 * A distinct colour for each fixed category, so no two look alike in the
 * feed or the category menu. Anything else (e.g. a publisher's name for
 * its avatar) gets one of the first eight by hash.
 */
const CATEGORY_TONES: Record<string, number> = {
  academics: 3, // purple
  campus: 5, // teal
  careers: 0, // blue
  scholarships: 1, // green
  workshops: 6, // amber
  competitions: 8, // red
  events: 4, // pink
  societies: 2, // orange
  sports: 7, // sky
};

export function categoryTone(name: string): number {
  const fixed = CATEGORY_TONES[name.toLowerCase()];
  if (fixed !== undefined) return fixed;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % 8;
}

/** "Computing Society" → "CS". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
