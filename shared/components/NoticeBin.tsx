import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { BinNotice } from "../types";
import { timeAgo } from "../format";
import { Icon } from "./Icon";
import { EmptyState } from "./EmptyState";

interface Props {
  token: string;
  /** The Admin sees everyone's deleted notices: say whose each one was. */
  showOwner: boolean;
  /** The PIN (or an unlocked device) is needed to restore; false stops. */
  ensureUnlocked: () => boolean | Promise<boolean>;
  /** A notice came back: refresh whatever lists it. */
  onRestored: () => void;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * Recently deleted: notices deleted in the last 30 days, with who deleted
 * them and when, each restorable exactly as it was.
 */
export function NoticeBin({ token, showOwner, ensureUnlocked, onRestored }: Props) {
  const [items, setItems] = useState<BinNotice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    api
      .getBin(token)
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [token]);

  const restore = async (item: BinNotice) => {
    if (!(await ensureUnlocked())) return;
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    try {
      await api.restoreDeletedNotice(item.id, null, token);
      setItems((prev) => prev?.filter((n) => n.id !== item.id) ?? null);
      setMessage(`"${item.title}" is back, exactly as it was.`);
      onRestored();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="ucpnb-bin">
      <p className="ucpnb-bin-note">Deleted notices stay here for 30 days, so they can be restored. After that they're removed for good.</p>
      {error && <p className="ucpnb-form-error">{error}</p>}
      {message && <p className="ucpnb-form-success">{message}</p>}
      {!items && !error && <div className="ucpnb-skeleton" style={{ height: 96, borderRadius: 12 }} />}
      {items?.length === 0 && (
        <EmptyState icon="trash" title="Nothing deleted">
          Notices deleted in the last 30 days show up here.
        </EmptyState>
      )}
      {items && items.length > 0 && (
        <ul className="ucpnb-manage-list">
          {items.map((n) => (
            <li key={n.id} className="ucpnb-manage-row">
              <div className="ucpnb-manage-info">
                <strong>{n.title}</strong>
                <span className="ucpnb-manage-meta">
                  {showOwner && <>{n.createdByName} · </>}
                  Deleted by {n.deletedByName} {timeAgo(n.deletedAt).replace(/^(Just now|Yesterday)$/, (w) => w.toLowerCase())} · removed for good on {day(n.purgeAt)}
                </span>
              </div>
              <div className="ucpnb-manage-actions">
                <button className="ucpnb-btn ucpnb-btn-secondary ucpnb-btn-sm" onClick={() => restore(n)} disabled={busyId === n.id}>
                  {busyId === n.id ? <span className="ucpnb-spinner" /> : <Icon name="restore" size={14} />}
                  Restore
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
