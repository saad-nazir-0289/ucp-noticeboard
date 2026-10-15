import type { AuthUser, Category, Notice } from "@shared/types";

const ROLL_NUMBER_KEY = "ucpnb_rollNumber";
const NAME_KEY = "ucpnb_name";
const UNIVERSITY_KEY = "ucpnb_university";
const DEPARTMENT_KEY = "ucpnb_department";

// Deliberately storing these purely locally, never as a session token.
// Re-identifying fresh on every visit means a role change made by the
// Admin takes effect on your very next open, with no stale cached
// session to clear manually.
//
// Name/University/Department are collected purely to make onboarding
// feel general-audience (not UCP-specific) for anyone outside UCP who
// finds this app — e.g. via a shared link on LinkedIn. They are NEVER
// sent to the backend at all: only the Roll Number is. The backend only
// ever trusts a name at the exact moment an account is first created
// (and only from the extension's DOM-scraped value, not anything typed
// here) — sending an unverified typed name would risk permanently
// locking in something wrong before the extension ever gets a chance to
// set the real one. University/Department have no backend field at
// all — there's nothing for them to attach to even if we wanted to.
export function getSavedIdentity(): {
  rollNumber: string;
  name: string;
  university: string;
  department: string;
} | null {
  const rollNumber = localStorage.getItem(ROLL_NUMBER_KEY);
  if (!rollNumber) return null;
  return {
    rollNumber,
    name: localStorage.getItem(NAME_KEY) ?? "",
    university: localStorage.getItem(UNIVERSITY_KEY) ?? "",
    department: localStorage.getItem(DEPARTMENT_KEY) ?? "",
  };
}

export function saveIdentity(rollNumber: string, name: string, university: string, department: string): void {
  localStorage.setItem(ROLL_NUMBER_KEY, rollNumber);
  localStorage.setItem(NAME_KEY, name);
  localStorage.setItem(UNIVERSITY_KEY, university);
  localStorage.setItem(DEPARTMENT_KEY, department);
}

export function clearIdentity(): void {
  localStorage.removeItem(ROLL_NUMBER_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(UNIVERSITY_KEY);
  localStorage.removeItem(DEPARTMENT_KEY);
}

const LAST_FEED_KEY = "ucpnb_lastFeed";

/** The last notices this device loaded, so the app still has something to show offline. */
export interface SavedFeed {
  rollNumber: string;
  user: Omit<AuthUser, "token">;
  logoUrl: string | null;
  notices: Notice[];
  categories: Category[];
  savedAt: string;
}

export function saveLastFeed(feed: Omit<SavedFeed, "savedAt">): void {
  try {
    localStorage.setItem(LAST_FEED_KEY, JSON.stringify({ ...feed, savedAt: new Date().toISOString() }));
  } catch {
    // Storage full or blocked: offline reading just isn't available then.
  }
}

/** The saved notices, only if they were saved for this roll number. */
export function getLastFeed(rollNumber: string): SavedFeed | null {
  try {
    const feed = JSON.parse(localStorage.getItem(LAST_FEED_KEY) ?? "null") as SavedFeed | null;
    return feed && feed.rollNumber.toUpperCase() === rollNumber.toUpperCase() ? feed : null;
  } catch {
    return null;
  }
}

export function clearLastFeed(): void {
  localStorage.removeItem(LAST_FEED_KEY);
}
