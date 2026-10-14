import { useEffect, useState } from "react";
import { api, hasDeviceToken } from "@shared/api/client";
import { isExpired } from "@shared/noticeForm";
import type { AuthUser, Notice } from "@shared/types";

interface Props {
  user: AuthUser;
  /** Bumped by the parent after a save, to reload the list. */
  refreshKey: number;
  onNew: () => void;
  onEdit: (notice: Notice) => void;
  onDeleted: () => void;
  /** Needs the PIN first (this phone isn't unlocked). */
  onNeedsUnlock: () => void;
  onLockPhone: () => void;
  onClose: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A Publisher's own notices (an Admin's: everyone's), including ones
 * students no longer see — so old notices can still be fixed or removed.
 */
export function ManageNotices({ user, refreshKey, onNew, onEdit, onDeleted, onNeedsUnlock, onLockPhone, onClose }: Props) {
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const isAdmin = user.role === "Admin";

  useEffect(() => {
    api
      .getNotices(user.token, true, true)
      .then((all) => setNotices(isAdmin ? all : all.filter((n) => n.createdByUserId === user.id)))
      .catch(() => setError("Could not load your notices."));
  }, [user, refreshKey, isAdmin]);

  const handleDelete = async (notice: Notice) => {
    if (!hasDeviceToken()) {
      onNeedsUnlock();
      return;
    }
    if (!confirm(`Delete "${notice.title}"? Students will no longer see it, and this can't be undone.`)) return;
    setDeletingId(notice.id);
    setError(null);
    try {
      await api.deleteNotice(notice.id, null, user.token);
      setNotices((prev) => prev?.filter((n) => n.id !== notice.id) ?? null);
      onDeleted();
    } catch (err) {
      if (!hasDeviceToken()) onNeedsUnlock();
      else setError(err instanceof Error ? err.message : "Could not delete the notice.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="ucpnb-grid-overlay" onClick={onClose}>
      <div className="ucpnb-grid-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ucpnb-sheet-header">
          <h3>{isAdmin ? "All notices" : "My notices"}</h3>
          <button className="ucpnb-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <button className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-block" onClick={onNew}>
          + New notice
        </button>

        {error && <p className="ucpnb-form-error">{error}</p>}
        {!notices && !error && <p className="ucpnb-status">Loading...</p>}
        {notices?.length === 0 && <p className="ucpnb-status">Nothing posted yet.</p>}

        <ul className="ucpnb-manage-list">
          {notices?.map((n) => (
            <li key={n.id} className="ucpnb-manage-row">
              <div className="ucpnb-manage-info">
                <strong>{n.title}</strong>
                <span>
                  {isExpired(n) ? <em className="ucpnb-pill ucpnb-pill-muted">Expired</em> : <em className="ucpnb-pill">Live</em>}
                  {" "}
                  {formatDate(n.createdAt)}
                  {isAdmin && ` · ${n.createdByName}`}
                  {` · ${n.viewCount} views`}
                </span>
              </div>
              <div className="ucpnb-manage-actions">
                <button className="ucpnb-btn ucpnb-btn-link" onClick={() => onEdit(n)}>
                  Edit
                </button>
                <button
                  className="ucpnb-btn ucpnb-btn-link ucpnb-btn-danger"
                  onClick={() => handleDelete(n)}
                  disabled={deletingId === n.id}
                >
                  {deletingId === n.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>

        {hasDeviceToken() && (
          <p className="ucpnb-sheet-text ucpnb-sheet-footer">
            🔓 This phone is unlocked for posting.{" "}
            <button className="ucpnb-btn ucpnb-btn-link" onClick={onLockPhone}>
              Lock it
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
