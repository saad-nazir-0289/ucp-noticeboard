import type { Notice } from "./types";

/**
 * Whether students no longer see this notice — mirrors the backend rule
 * (NoticeQueryService): past its deadline, or 7 days old if it has none
 * and isn't pinned. Management views show these with an "expired" marker.
 */
export function isExpired(notice: Notice): boolean {
  const now = new Date();
  if (notice.deadline) {
    return new Date(notice.deadline) <= now;
  }
  if (notice.isPinned) return false;
  const sevenDaysAfterCreated = new Date(notice.createdAt);
  sevenDaysAfterCreated.setDate(sevenDaysAfterCreated.getDate() + 7);
  return sevenDaysAfterCreated <= now;
}

/** Feed order, same as the API's: pinned notices first, then newest first. */
export function compareNotices(a: Notice, b: Notice): number {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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
