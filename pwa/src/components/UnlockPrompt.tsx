import { useState } from "react";
import { api } from "@shared/api/client";

interface Props {
  token: string;
  onUnlocked: (deviceToken: string) => void;
  onClose: () => void;
}

/**
 * Asked once per phone: the PIN unlocks posting here for 30 days (renewed
 * whenever it's used). A Publisher's very first PIN becomes their PIN.
 */
export function UnlockPrompt({ token, onUnlocked, onClose }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) {
      setError("Enter your 4-6 digit PIN.");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const result = await api.unlockDevice(pin, token);
      onUnlocked(result.deviceToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock — please try again.");
      setPin("");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="ucpnb-modal-overlay" onClick={onClose}>
      <form className="ucpnb-sheet ucpnb-sheet-compact ucpnb-form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="ucpnb-sheet-header">
          <h3>Unlock posting on this phone</h3>
          <button type="button" className="ucpnb-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="ucpnb-sheet-text">
          Enter your PIN once and this phone can post without it for the next 30 days.
          First time? Choose a 4-6 digit PIN now — it becomes yours.
        </p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Your PIN"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          maxLength={6}
        />
        {error && <p className="ucpnb-form-error">{error}</p>}
        <button type="submit" className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-block" disabled={working}>
          {working ? "Checking..." : "Unlock"}
        </button>
      </form>
    </div>
  );
}
