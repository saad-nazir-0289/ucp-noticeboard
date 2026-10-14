import { useState } from "react";
import { Icon } from "@shared/components/Icon";

interface Props {
  onSubmit: (rollNumber: string, name: string, university: string, department: string) => void;
}

export function RollNumberEntry({ onSubmit }: Props) {
  const [rollNumber, setRollNumber] = useState("");
  const [name, setName] = useState("");
  const [university, setUniversity] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedRollNumber = rollNumber.trim();
    if (!trimmedRollNumber) {
      setError("Please enter your Roll Number or Student ID.");
      return;
    }
    onSubmit(trimmedRollNumber, name.trim(), university.trim(), department.trim());
  };

  return (
    <div className="ucpnb-onboarding">
      <div className="ucpnb-onboarding-hero">
        <span className="ucpnb-logo ucpnb-logo-lg">
          <Icon name="megaphone" size={30} />
        </span>
        <h1>Every campus notice, in one place</h1>
        <p>Deadlines, events and announcements from your societies and departments, on your phone as soon as they're posted.</p>
      </div>

      <form onSubmit={handleSubmit} className="ucpnb-onboarding-card">
        <h2>Let's get you set up</h2>
        <p className="ucpnb-sheet-text">You only need to do this once. This device will remember you.</p>

        <label className="ucpnb-field">
          <span className="ucpnb-field-label">Roll Number / Student ID</span>
          <input
            className="ucpnb-input"
            type="text"
            placeholder="e.g. L1F23BSCS0285"
            autoCapitalize="characters"
            autoComplete="off"
            value={rollNumber}
            onChange={(e) => setRollNumber(e.target.value)}
            autoFocus
          />
        </label>
        <label className="ucpnb-field">
          <span className="ucpnb-field-label">Your name</span>
          <input className="ucpnb-input" type="text" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="ucpnb-field-pair">
          <label className="ucpnb-field">
            <span className="ucpnb-field-label">University</span>
            <input className="ucpnb-input" type="text" placeholder="UCP" value={university} onChange={(e) => setUniversity(e.target.value)} />
          </label>
          <label className="ucpnb-field">
            <span className="ucpnb-field-label">Department</span>
            <input className="ucpnb-input" type="text" placeholder="e.g. FOIT" value={department} onChange={(e) => setDepartment(e.target.value)} />
          </label>
        </div>

        {error && <p className="ucpnb-form-error">{error}</p>}
        <button type="submit" className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-lg ucpnb-btn-block">
          Continue
          <Icon name="chevronRight" size={18} />
        </button>
        <p className="ucpnb-onboarding-note">
          <Icon name="lock" size={14} />
          Only your Roll Number is sent to NoticeBoard. Name, university and department stay on this device.
        </p>
      </form>
    </div>
  );
}
