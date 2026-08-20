const ROLL_NUMBER_KEY = "ucpnb_rollNumber";

// Deliberately storing ONLY the Roll Number, never a session token or a
// name — same reasoning as the extension: re-identifying fresh on every
// visit means a role change made by the Admin takes effect on your very
// next open, with no stale cached session to clear manually. Name isn't
// collected here at all anymore: the backend only ever trusts a name at
// the exact moment an account is first created (and falls back to the
// Roll Number itself if none is given), so asking a returning user to
// re-type their name would be pure friction — the backend silently
// ignores it for any account that already exists.
export function getSavedIdentity(): { rollNumber: string } | null {
  const rollNumber = localStorage.getItem(ROLL_NUMBER_KEY);
  if (!rollNumber) return null;
  return { rollNumber };
}

export function saveIdentity(rollNumber: string): void {
  localStorage.setItem(ROLL_NUMBER_KEY, rollNumber);
}

export function clearIdentity(): void {
  localStorage.removeItem(ROLL_NUMBER_KEY);
}
