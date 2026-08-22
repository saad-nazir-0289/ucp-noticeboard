import { useState } from "react";
import type { Notice } from "../types";
import { shareNotice } from "../content/share";
import { optimizeImageUrl } from "../content/imageOptimize";

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
  const [shared, setShared] = useState(false);

  const handleShare = async () => {
    const result = await shareNotice(notice);
    if (result === "copied") {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

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
              style={{ backgroundImage: `url(${optimizeImageUrl(notice.imageUrl, 60)})` }}
              aria-hidden="true"
            />
            <img className="ucpnb-modal-image" src={optimizeImageUrl(notice.imageUrl, 700) ?? undefined} alt="" />
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
          <div className="ucpnb-modal-actions">
            {notice.linkUrl && (
              <a
                className="ucpnb-btn ucpnb-btn-primary"
                href={notice.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Link
              </a>
            )}
            <button className="ucpnb-btn" onClick={handleShare}>
              {shared ? "Link copied!" : "🔗 Share"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
