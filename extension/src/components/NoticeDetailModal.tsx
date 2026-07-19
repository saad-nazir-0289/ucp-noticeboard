import type { Notice } from "../types";

interface Props {
  notice: Notice;
  onClose: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function NoticeDetailModal({ notice, onClose }: Props) {
  return (
    <div className="ucpnb-modal-overlay" onClick={onClose}>
      <div className="ucpnb-modal" onClick={(e) => e.stopPropagation()}>
        <button className="ucpnb-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {notice.imageUrl && (
          <img className="ucpnb-modal-image" src={notice.imageUrl} alt="" />
        )}

        <div className="ucpnb-modal-content">
          <h2 className="ucpnb-modal-title">{notice.title}</h2>
          <div className="ucpnb-modal-meta">
            <span>By {notice.createdByName}</span>
            <span>·</span>
            <span>{formatDate(notice.createdAt)}</span>
          </div>
          <p className="ucpnb-modal-desc">{notice.description}</p>
        </div>
      </div>
    </div>
  );
}
