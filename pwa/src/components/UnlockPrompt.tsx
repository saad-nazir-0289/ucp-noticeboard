import { useState } from "react";
import { api } from "@shared/api/client";
import { Icon } from "@shared/components/Icon";

interface Props {
  token: string;
  /** No PIN chosen yet: ask for a new one twice instead. */
  firstTime?: boolean;
  onUnlocked: (deviceToken: string) => void;
  onClose: () => void;
}

/**
 * Asked once per phone: the PIN unlocks posting here for 30 days (renewed
 * whenever it's used). A Publisher's very first PIN becomes their PIN.
 */
export function UnlockPrompt({ token, firstTime = false, onUnlocked, onClose }: Props) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

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
    setWorking(true);
    setError(null);
    try {
      const result = await api.unlockDevice(pin, token);
      onUnlocked(result.deviceToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock. Please try again.");
      setPin("");
      setConfirmPin("");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="ucpnb-overlay" onClick={onClose}>
      <form
        className="ucpnb-sheet ucpnb-sheet-compact"
        role="dialog"
        aria-modal="true"
        aria-label="Unlock posting"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div className="ucpnb-sheet-handle" aria-hidden="true" />
        <div className="ucpnb-sheet-content ucpnb-unlock">
          <span className="ucpnb-unlock-icon">
            <Icon name="lock" size={26} />
          </span>
          <h3>{firstTime ? "Choose your PIN" : "Unlock posting on this phone"}</h3>
          <p className="ucpnb-sheet-text">
            {firstTime
              ? "You can now post notices. Choose a PIN of 4–6 digits and keep it to yourself: it protects posting under your name. This phone stays unlocked for 30 days."
              : "Enter your PIN once and this phone can post for the next 30 days without asking again."}
          </p>
          <input
            className="ucpnb-input ucpnb-input-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="••••"
            aria-label={firstTime ? "New PIN" : "PIN"}
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
              autoComplete="off"
              placeholder="••••"
              aria-label="Type the PIN again"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
            />
          )}
          {error && <p className="ucpnb-form-error">{error}</p>}
          <button type="submit" className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-lg ucpnb-btn-block" disabled={working}>
            {working ? <span className="ucpnb-spinner" /> : firstTime ? "Save PIN" : "Unlock"}
          </button>
          <button type="button" className="ucpnb-btn ucpnb-btn-ghost ucpnb-btn-block" onClick={onClose}>
            Not now
          </button>
        </div>
      </form>
    </div>
  );
}
