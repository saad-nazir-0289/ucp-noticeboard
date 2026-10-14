import { useEffect, useState } from "react";
import { api, hasDeviceToken } from "@shared/api/client";
import { isExpired } from "@shared/noticeForm";
import type { AuthUser, Notice } from "@shared/types";
import { Icon } from "@shared/components/Icon";
import { EmptyState } from "@shared/components/EmptyState";
import { CategoryTag } from "@shared/components/Tags";
import { timeAgo } from "@shared/format";

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
    <div className="ucpnb-overlay" onClick={onClose}>
      <div className="ucpnb-sheet ucpnb-sheet-tall" role="dialog" aria-modal="true" aria-label="Manage notices" onClick={(e) => e.stopPropagation()}>
        <div className="ucpnb-sheet-header">
          <h3>{isAdmin ? "All notices" : "My notices"}</h3>
          <div className="ucpnb-sheet-header-actions">
            <button className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-sm" onClick={onNew}>
              <Icon name="plus" size={16} />
              New
            </button>
            <button className="ucpnb-icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </div>

        <div className="ucpnb-sheet-content">
          {error && <p className="ucpnb-form-error">{error}</p>}
          {!notices && !error && (
            <div className="ucpnb-manage-list">
              {[0, 1, 2].map((i) => (
                <div className="ucpnb-manage-row" key={i}>
                  <div className="ucpnb-skeleton" style={{ width: "70%", height: 14 }} />
                </div>
              ))}
            </div>
          )}
          {notices?.length === 0 && (
            <EmptyState icon="megaphone" title="Nothing posted yet">
              Your notices will appear here, including ones students no longer see.
            </EmptyState>
          )}

          {notices && notices.length > 0 && (
            <ul className="ucpnb-manage-list">
              {notices.map((n) => {
                const expired = isExpired(n);
                return (
                  <li key={n.id} className="ucpnb-manage-row">
                    <div className="ucpnb-manage-info">
                      <div className="ucpnb-card-tags">
                        <span className={expired ? "ucpnb-badge ucpnb-badge-closed" : "ucpnb-badge ucpnb-badge-success"}>
                          {expired ? "Expired" : "Live"}
                        </span>
                        {n.categoryName && <CategoryTag name={n.categoryName} />}
                      </div>
                      <strong>{n.title}</strong>
                      <span className="ucpnb-manage-meta">
                        {isAdmin && <>{n.createdByName} · </>}
                        {timeAgo(n.createdAt)} · <Icon name="eye" size={13} /> {n.viewCount} · <Icon name="heart" size={13} /> {n.likeCount}
                      </span>
                    </div>
                    <div className="ucpnb-manage-actions">
                      <button className="ucpnb-icon-btn" onClick={() => onEdit(n)} aria-label={`Edit ${n.title}`} title="Edit">
                        <Icon name="pencil" size={18} />
                      </button>
                      <button
                        className="ucpnb-icon-btn ucpnb-icon-btn-danger"
                        onClick={() => handleDelete(n)}
                        disabled={deletingId === n.id}
                        aria-label={`Delete ${n.title}`}
                        title="Delete"
                      >
                        {deletingId === n.id ? <span className="ucpnb-spinner" /> : <Icon name="trash" size={18} />}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {hasDeviceToken() && (
          <div className="ucpnb-sheet-footer ucpnb-unlocked-note">
            <Icon name="unlock" size={16} />
            <span>This phone is unlocked for posting.</span>
            <button className="ucpnb-btn ucpnb-btn-ghost ucpnb-btn-sm" onClick={onLockPhone}>
              Lock it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
