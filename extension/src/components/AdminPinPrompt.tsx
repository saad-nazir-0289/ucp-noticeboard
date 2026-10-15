import { useState } from "react";
import { Icon } from "@shared/components/Icon";

interface Props {
  /** e.g. "Enter your PIN to open Users". */
  title: string;
  /** Tries the PIN against the server; resolves on success, rejects with the server's message. */
  onUnlock: (pin: string) => Promise<void>;
  /** Shown as a Cancel button (the dialog form); omitted inline. */
  onCancel?: () => void;
}

/**
 * Asks for the PIN once to unlock this Chrome (see content/deviceUnlock.ts):
 * an Admin or Publisher token alone is not enough, since anyone who knows
 * the Roll Number gets one. After that, posting, deleting and the Admin
 * sections work without the PIN until "Lock" is used or 30 days unused.
 */
export function AdminPinPrompt({ title, onUnlock, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setError("Enter your PIN (4–6 digits).");
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
    <div className="ucpnb-tab-panel">
      <form className="ucpnb-form-card ucpnb-pin-card" onSubmit={submit}>
        <span className="ucpnb-unlock-icon">
          <Icon name="lock" size={24} />
        </span>
        <h4>{title}</h4>
        <p className="ucpnb-field-hint">Once per computer. First time? The PIN you choose now becomes yours.</p>
        <input
          className="ucpnb-input ucpnb-input-pin"
          type="password"
          inputMode="numeric"
          placeholder="Your PIN"
          aria-label="Your PIN"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          maxLength={6}
        />
        {error && <p className="ucpnb-form-error">{error}</p>}
        <button type="submit" className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-block" disabled={checking}>
          {checking ? <span className="ucpnb-spinner" /> : "Unlock"}
        </button>
        {onCancel && (
          <button type="button" className="ucpnb-btn ucpnb-btn-ghost ucpnb-btn-block" onClick={onCancel}>
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}
