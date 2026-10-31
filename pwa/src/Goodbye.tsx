import { useState } from "react";
import { api } from "@shared/api/client";
import { Icon } from "@shared/components/Icon";
import { UNINSTALL_REASONS } from "@shared/uninstallReasons";

const STORE_URL = "https://chromewebstore.google.com/detail/dmkdgckajefikfbbfblihmnamjiaemfg";

/**
 * The page Chrome opens after the NoticeBoard extension is removed
 * (extension background.js, chrome.runtime.setUninstallURL). One question,
 * answered anonymously: no Roll Number or name is sent, only the reason,
 * an optional comment and the version that was removed.
 */
export function Goodbye({ extensionVersion }: { extensionVersion: string | null }) {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      setError("Please choose a reason.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.sendUninstallFeedback(reason, comment.trim(), extensionVersion);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ucpnb-onboarding">
      <div className="ucpnb-onboarding-hero">
        <span className="ucpnb-logo ucpnb-logo-lg">
          <Icon name="megaphone" size={30} />
        </span>
        <h1>NoticeBoard has been removed</h1>
        <p>Sorry to see you go. One quick question helps make it better for everyone.</p>
      </div>

      {sent ? (
        <div className="ucpnb-onboarding-card">
          <h2>Thank you</h2>
          <p className="ucpnb-sheet-text">Your answer has been sent. You can add NoticeBoard back any time.</p>
          <a className="ucpnb-btn ucpnb-btn-secondary ucpnb-btn-block" href={STORE_URL}>
            Add it back to Chrome
          </a>
        </div>
      ) : (
        <form onSubmit={submit} className="ucpnb-onboarding-card">
          <h2>What made you remove NoticeBoard?</h2>
          <div className="ucpnb-goodbye-reasons" role="radiogroup" aria-label="Reason">
            {UNINSTALL_REASONS.map((r) => (
              <label key={r.id} className="ucpnb-toggle-row">
                <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
                <span>
                  <strong>{r.label}</strong>
                </span>
              </label>
            ))}
          </div>
          <label className="ucpnb-field">
            <span className="ucpnb-field-label">Anything else? (optional)</span>
            <textarea
              className="ucpnb-input"
              rows={3}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What would have made you keep it?"
            />
          </label>
          {error && <p className="ucpnb-form-error">{error}</p>}
          <button type="submit" className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-lg ucpnb-btn-block" disabled={sending}>
            {sending ? <span className="ucpnb-spinner" /> : "Send"}
          </button>
          <p className="ucpnb-onboarding-note">
            <Icon name="lock" size={14} />
            Anonymous: your Roll Number and name are not sent.
          </p>
        </form>
      )}
    </div>
  );
}
