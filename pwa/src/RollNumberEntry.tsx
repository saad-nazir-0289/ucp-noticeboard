import { useState } from "react";

interface Props {
  onSubmit: (rollNumber: string) => void;
}

// Same shape the extension's studentIdentity.ts already scrapes for
// (letter(s), digit, letter, 2 digits, program code, 3-6 digits) — kept
// case-insensitive since students may type it in any case. This only
// catches obviously malformed input (wrong shape, missing digits, random
// text) — it can't catch a well-formed but mistyped Roll Number that
// happens to belong to someone else, which is a different, harder problem.
const ROLL_NUMBER_REGEX = /^[A-Za-z]{1,2}\d[A-Za-z]\d{2}[A-Za-z]{2,8}\d{3,6}$/;

export function RollNumberEntry({ onSubmit }: Props) {
  const [rollNumber, setRollNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = rollNumber.trim();
    if (!trimmed) {
      setError("Please enter your Roll Number.");
      return;
    }
    if (!ROLL_NUMBER_REGEX.test(trimmed)) {
      setError("That doesn't look like a valid Roll Number — check the format and try again.");
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <div className="ucpnb-onboarding">
      <div className="ucpnb-onboarding-card">
        <h2>Welcome to UCP NoticeBoard</h2>
        <p className="ucpnb-status">
          Enter your Roll Number once - this device will remember it, no need
          to type it again.
        </p>
        <form onSubmit={handleSubmit} className="ucpnb-form">
          <input
            type="text"
            placeholder="Roll Number (e.g. L1S00BSCS0000)"
            value={rollNumber}
            onChange={(e) => setRollNumber(e.target.value)}
            autoFocus
          />
          {error && <p className="ucpnb-error">{error}</p>}
          <button type="submit" className="ucpnb-btn ucpnb-btn-primary">
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}

