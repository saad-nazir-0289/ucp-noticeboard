import type { Notice } from "../types";

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
              style={{ backgroundImage: `url(${notice.imageUrl})` }}
              aria-hidden="true"
            />
            <img className="ucpnb-card-image" src={notice.imageUrl} alt="" loading="lazy" />
          </>
        ) : (
          <div className="ucpnb-card-image ucpnb-card-image-placeholder" aria-hidden="true">
            📌
          </div>
        )}
      </div>
      <div className="ucpnb-card-body">
        {notice.categoryName && <span className="ucpnb-card-category">{notice.categoryName}</span>}
        <h4 className="ucpnb-card-title">{notice.title}</h4>
        <p className="ucpnb-card-desc">
          {notice.description.length > 90
            ? `${notice.description.slice(0, 90)}...`
            : notice.description}
        </p>
        <div className="ucpnb-card-footer">
          <span className="ucpnb-card-date">{formatDate(notice.createdAt)}</span>
          {onRestore && (
            <button
              className="ucpnb-btn ucpnb-btn-link"
              onClick={(e) => {
                e.stopPropagation();
                onRestore(notice);
              }}
            >
              Restore
            </button>
          )}
        </div>
        {notice.deadline && (
          <div className="ucpnb-card-deadline">Deadline: {formatDate(notice.deadline)}</div>
        )}
      </div>
    </div>
  );
}
