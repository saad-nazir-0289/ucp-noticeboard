import { useState } from "react";
import { Icon } from "@shared/components/Icon";

interface Props {
  /** e.g. "Enter your PIN to open Users". */
  title: string;
  /** Tries the PIN against the server; resolves on success, rejects with the server's message. */
  onUnlock: (pin: string) => Promise<void>;
  /** Shown as a Cancel button (the dialog form); omitted inline. */
  onCancel?: () => void;
  /** No PIN chosen yet: ask for a new one twice instead. */
  firstTime?: boolean;
}

/**
 * Asks for the PIN once to unlock this Chrome (see content/deviceUnlock.ts):
 * an Admin or Publisher token alone is not enough, since anyone who knows
 * the Roll Number gets one. After that, posting, deleting and the Admin
 * sections work without the PIN until "Lock" is used or 30 days unused.
 */
export function AdminPinPrompt({ title, onUnlock, onCancel, firstTime = false }: Props) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setError(firstTime ? "Choose a PIN of 4–6 digits." : "Enter your PIN (4–6 digits).");
      return;
    }
    if (firstTime && pin !== confirmPin) {
      setError("The two PINs don't match. Type the same PIN twice.");
      setConfirmPin("");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      await onUnlock(pin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify your PIN.");
      setPin("");
      setConfirmPin("");
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
        <h4>{firstTime ? "Choose your PIN" : title}</h4>
        <p className="ucpnb-field-hint">
          {firstTime
            ? "4–6 digits, kept to yourself: it protects posting under your name. Asked once per computer."
            : "Once per computer."}
        </p>
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
        {firstTime && (
          <input
            className="ucpnb-input ucpnb-input-pin"
            type="password"
            inputMode="numeric"
            placeholder="••••"
            aria-label="Type the PIN again"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
          />
        )}
        {error && <p className="ucpnb-form-error">{error}</p>}
        <button type="submit" className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-block" disabled={checking}>
          {checking ? <span className="ucpnb-spinner" /> : firstTime ? "Save PIN" : "Unlock"}
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
