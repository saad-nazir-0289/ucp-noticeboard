// The device token a Publisher/Admin gets by entering their PIN once on
// this phone (backend: POST /auth/unlock). It stands in for the PIN on
// every privileged action until it expires (30 days unused) or is logged
// out. Stored with the Roll Number it belongs to, so switching identity on
// a shared device can never reuse someone else's unlock.
const KEY = "ucpnb_deviceUnlock";

export function getSavedDeviceToken(rollNumber: string): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { rollNumber: string; token: string } | null;
    return saved && saved.rollNumber === rollNumber.toUpperCase() ? saved.token : null;
  } catch {
    return null;
  }
}

export function saveDeviceToken(rollNumber: string, token: string): void {
  localStorage.setItem(KEY, JSON.stringify({ rollNumber: rollNumber.toUpperCase(), token }));
}

export function clearDeviceToken(): void {
  localStorage.removeItem(KEY);
}
