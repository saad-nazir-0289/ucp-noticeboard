// The unlock a Publisher/Admin gets by entering their PIN once in this
// Chrome (backend: POST /auth/unlock). The token stands in for the PIN on
// every privileged action until it expires (30 days unused), the Admin
// revokes it, or "Lock" is used. Kept in the extension's own storage, which
// the portal page's scripts can't read (unlike the page's localStorage),
// and tied to the Roll Number, so another student on the same computer
// never inherits it.
const KEY = "ucpnb_deviceUnlock";

interface SavedUnlock {
  rollNumber: string;
  token: string;
}

export async function loadDeviceToken(rollNumber: string): Promise<string | null> {
  try {
    const saved = (await chrome.storage.local.get(KEY))[KEY] as SavedUnlock | undefined;
    return saved && saved.rollNumber === rollNumber.toUpperCase() ? saved.token : null;
  } catch {
    return null;
  }
}

export async function saveDeviceToken(rollNumber: string, token: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [KEY]: { rollNumber: rollNumber.toUpperCase(), token } satisfies SavedUnlock });
  } catch {
    // Not remembered after a reload, but this visit stays unlocked.
  }
}

export async function clearDeviceToken(): Promise<void> {
  try {
    await chrome.storage.local.remove(KEY);
  } catch {
    // Nothing saved to clear.
  }
}
