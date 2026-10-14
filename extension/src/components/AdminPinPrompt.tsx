import { useState } from "react";

interface Props {
  /** What the PIN unlocks, e.g. "Manage Users". */
  section: string;
  /** Tries the PIN against the server; resolves on success, rejects with the server's message. */
  onUnlock: (pin: string) => Promise<void>;
}

/**
 * Admin sections need the Admin's PIN — an Admin token alone is not
 * enough, since anyone who knows the Admin's Roll Number gets one. Asked
 * once per page visit and then shared by every Admin section (the PIN is
 * held in memory only, never stored).
 */
export function AdminPinPrompt({ section, onUnlock }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setError("Enter your 4-6 digit PIN.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      await onUnlock(pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify your PIN.");
      setPin("");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="ucpnb-panel">
      <form className="ucpnb-form" onSubmit={submit}>
        <p className="ucpnb-status">
          Enter your PIN to open {section}. You won't be asked again until you reload the page.
        </p>
        <input
          type="password"
          inputMode="numeric"
          placeholder="Your PIN"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          maxLength={6}
        />
        {error && <p className="ucpnb-error">{error}</p>}
        <div className="ucpnb-form-actions">
          <button type="submit" className="ucpnb-btn ucpnb-btn-primary" disabled={checking}>
            {checking ? "Checking..." : "Unlock"}
          </button>
        </div>
      </form>
    </div>
  );
}
