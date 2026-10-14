import type { Notice } from "./types";

/**
 * Whether students no longer see this notice — mirrors the backend rule
 * (NoticeQueryService): past its deadline, or 7 days old if it has none.
 * Management views show these with an "expired" marker.
 */
export function isExpired(notice: Notice): boolean {
  const now = new Date();
  if (notice.deadline) {
    return new Date(notice.deadline) <= now;
  }
  const sevenDaysAfterCreated = new Date(notice.createdAt);
  sevenDaysAfterCreated.setDate(sevenDaysAfterCreated.getDate() + 7);
  return sevenDaysAfterCreated <= now;
}

// datetime-local inputs need "YYYY-MM-DDTHH:mm" in LOCAL time, not the ISO
// UTC string the API returns/expects — these two convert between them.
export function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}
