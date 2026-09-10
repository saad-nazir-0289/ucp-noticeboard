import { useState } from "react";

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
      <div className="ucpnb-onboarding-card">
        <h2>Welcome to NoticeBoard</h2>
        <p className="ucpnb-status">
          A couple of details, once — this device will remember them, no
          need to enter them again.
        </p>
        <form onSubmit={handleSubmit} className="ucpnb-form">
          <input
            type="text"
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            placeholder="University"
            value={university}
            onChange={(e) => setUniversity(e.target.value)}
          />
          <input
            type="text"
            placeholder="Department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
          <input
            type="text"
            placeholder="Roll Number / Student ID"
            value={rollNumber}
            onChange={(e) => setRollNumber(e.target.value)}
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
