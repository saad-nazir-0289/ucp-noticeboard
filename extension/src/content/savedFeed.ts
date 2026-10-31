import type { AuthUser, Category, Notice } from "@shared/types";

// The notices this Chrome saw last time, so opening a Horizon page shows
// them straight away instead of waiting on the server, and the fresh ones
// replace them a moment later. Kept in the extension's own storage (the
// portal page's scripts can't read it) and tied to the Roll Number, so
// another student on the same computer never sees someone else's feed.
// No sign-in token is kept: the feed only stands in until sign-in finishes.
const KEY = "ucpnb_lastFeed";

export interface SavedFeed {
  user: Omit<AuthUser, "token">;
  notices: Notice[];
  categories: Category[];
}

export async function loadSavedFeed(rollNumber: string): Promise<SavedFeed | null> {
  try {
    const saved = (await chrome.storage.local.get(KEY))[KEY] as SavedFeed | undefined;
    return saved && saved.user.rollNumber.toUpperCase() === rollNumber.toUpperCase() ? saved : null;
  } catch {
    return null;
  }
}

export async function saveFeed(feed: SavedFeed): Promise<void> {
  try {
    await chrome.storage.local.set({ [KEY]: feed });
  } catch {
    // Next visit just waits for the server, as before.
  }
}
