import type { Notice } from "../types";

interface Props {
  notice: Notice;
  onView: (notice: Notice) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function NoticeCard({ notice, onView }: Props) {
  return (
    <div className="ucpnb-card">
      <div className="ucpnb-card-image-wrap">
        {notice.imageUrl ? (
          <img className="ucpnb-card-image" src={notice.imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="ucpnb-card-image ucpnb-card-image-placeholder" aria-hidden="true">
            📌
          </div>
        )}
      </div>
      <div className="ucpnb-card-body">
        <h4 className="ucpnb-card-title">{notice.title}</h4>
        <p className="ucpnb-card-desc">
          {notice.description.length > 90
            ? `${notice.description.slice(0, 90)}...`
            : notice.description}
        </p>
        <div className="ucpnb-card-footer">
          <span className="ucpnb-card-date">{formatDate(notice.createdAt)}</span>
          <button className="ucpnb-btn ucpnb-btn-link" onClick={() => onView(notice)}>
            View
          </button>
        </div>
      </div>
    </div>
  );
}
