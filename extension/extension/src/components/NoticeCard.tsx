import { useState } from "react";
import type { Notice } from "../types";
import { shareNotice } from "../content/share";
import { optimizeImageUrl } from "../content/imageOptimize";

interface Props {
  notice: Notice;
  onView: (notice: Notice) => void;
  onDismiss?: (notice: Notice) => void;
  onRestore?: (notice: Notice) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function NoticeCard({ notice, onView, onDismiss, onRestore }: Props) {
  const [shared, setShared] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const result = await shareNotice(notice);
    if (result === "copied") {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  return (
    <div className="ucpnb-card" onClick={() => onView(notice)} role="button" tabIndex={0}>
      {onDismiss && (
        <button
          className="ucpnb-card-dismiss"
          aria-label="Hide this notice"
          title="Hide this notice"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(notice);
          }}
        >
          ×
        </button>
      )}

      <div className="ucpnb-card-image-wrap">
        {notice.imageUrl ? (
          <>
            <div
              className="ucpnb-card-image-bg"
              style={{ backgroundImage: `url(${optimizeImageUrl(notice.imageUrl, 40)})` }}
              aria-hidden="true"
            />
            <img
              className="ucpnb-card-image"
              src={optimizeImageUrl(notice.imageUrl, 400) ?? undefined}
              alt=""
              loading="lazy"
            />
          </>
        ) : (
          <div className="ucpnb-card-image ucpnb-card-image-placeholder" aria-hidden="true">
            📌
          </div>
        )}
        <button
          className="ucpnb-card-share"
          aria-label="Share this notice"
          title={shared ? "Link copied!" : "Share this notice"}
          onClick={handleShare}
        >
          {shared ? "✓" : "🔗"}
        </button>
      </div>
      <div className="ucpnb-card-body">
        {notice.categoryName && <span className="ucpnb-card-category">{notice.categoryName}</span>}
        <h4 className="ucpnb-card-title">{notice.title}</h4>
        {onRestore && (
          <div className="ucpnb-card-footer">
            <button
              className="ucpnb-btn ucpnb-btn-link"
              onClick={(e) => {
                e.stopPropagation();
                onRestore(notice);
              }}
            >
              Restore
            </button>
          </div>
        )}
        {notice.deadline && (
          <div className="ucpnb-card-deadline">Deadline: {formatDate(notice.deadline)}</div>
        )}
      </div>
    </div>
  );
}
