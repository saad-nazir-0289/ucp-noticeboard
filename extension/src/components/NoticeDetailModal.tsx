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
          <div className="ucpnb-modal-image-wrap">
            <div
              className="ucpnb-modal-image-bg"
              style={{ backgroundImage: `url(${notice.imageUrl})` }}
              aria-hidden="true"
            />
            <img className="ucpnb-modal-image" src={notice.imageUrl} alt="" />
          </div>
        )}

        <div className="ucpnb-modal-content">
          {notice.categoryName && <span className="ucpnb-card-category">{notice.categoryName}</span>}
          <h2 className="ucpnb-modal-title">{notice.title}</h2>
          <div className="ucpnb-modal-meta">
            <span>By {notice.createdByName}</span>
            <span>·</span>
            <span>{formatDate(notice.createdAt)}</span>
            {notice.deadline && (
              <>
                <span>·</span>
                <span>Deadline: {formatDate(notice.deadline)}</span>
              </>
            )}
          </div>
          <p className="ucpnb-modal-desc">{notice.description}</p>
          {notice.linkUrl && (
            <a
              className="ucpnb-btn ucpnb-btn-primary ucpnb-modal-link"
              href={notice.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Link
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
