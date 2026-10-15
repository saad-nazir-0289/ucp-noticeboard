/**
 * Short how-to animations ("swipe right to archive", "turn on
 * notifications"): shown on the first few times the app is opened, and
 * never again once the person has done the thing itself. A showing
 * counts once per app open, however long it stays open.
 */
export type CoachTip = "archive" | "notifications";

const TIMES = 5;
const countKey = (tip: CoachTip) => `ucpnb_coach_${tip}_shown`;
const doneKey = (tip: CoachTip) => `ucpnb_coach_${tip}_done`;
const shownThisOpen = new Set<CoachTip>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the tip just shows again next time.
  }
}

/** Whether this tip still has showings left and hasn't been shown in this app open. */
export function coachDue(tip: CoachTip): boolean {
  if (read(doneKey(tip)) === "1" || shownThisOpen.has(tip)) return false;
  return Number(read(countKey(tip)) ?? "0") < TIMES;
}

/** Counts a showing, once per app open. */
export function coachShown(tip: CoachTip): void {
  if (shownThisOpen.has(tip)) return;
  shownThisOpen.add(tip);
  write(countKey(tip), String(Number(read(countKey(tip)) ?? "0") + 1));
}

/** The person did it themselves: no more showings. */
export function coachDone(tip: CoachTip): void {
  write(doneKey(tip), "1");
}
