import { useState } from "react";
import type { Notice } from "../types";
import { shareNotice } from "../share";
import { optimizeImageUrl } from "../imageOptimize";
import { categoryTone } from "../format";
import { Icon } from "./Icon";
import { Avatar, CategoryTag, DeadlineBadge, PinnedBadge } from "./Tags";

interface Props {
  notice: Notice;
  onView: (notice: Notice) => void;
  onDismiss?: (notice: Notice) => void;
  onRestore?: (notice: Notice) => void;
  /** Poster width to request from Cloudinary, sized to how wide this app shows cards. */
  imageWidth?: number;
}

/**
 * A notice in a feed. Every card has the same shape so feeds line up: the
 * poster on top, or — for notices without one — a banner in the
 * category's colour, then a fixed-height title, preview and footer.
 */
export function NoticeCard({ notice, onView, onDismiss, onRestore, imageWidth = 600 }: Props) {
  const [shared, setShared] = useState(false);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const handleShare = async (e: React.MouseEvent) => {
    stop(e);
    const result = await shareNotice(notice);
    if (result === "copied") {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  return (
    <article
      className="ucpnb-card"
      onClick={() => onView(notice)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView(notice);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={notice.title}
    >
      {notice.imageUrl ? (
        <div className="ucpnb-card-media">
          <div
            className="ucpnb-card-media-bg"
            style={{ backgroundImage: `url(${optimizeImageUrl(notice.imageUrl, 40)})` }}
            aria-hidden="true"
          />
          <img src={optimizeImageUrl(notice.imageUrl, imageWidth) ?? undefined} alt="" loading="lazy" />
        </div>
      ) : (
        <div className={`ucpnb-card-media ucpnb-card-banner ucpnb-tone-${categoryTone(notice.categoryName ?? "Notice")}`} aria-hidden="true">
          <Icon name="megaphone" size={30} strokeWidth={1.8} />
          <span>{notice.categoryName ?? "Notice"}</span>
          <Icon name="megaphone" size={150} strokeWidth={1} className="ucpnb-card-banner-mark" />
        </div>
      )}

      <div className="ucpnb-card-body">
        <div className="ucpnb-card-tags">
          {notice.isPinned && <PinnedBadge />}
          {/* Posterless cards already name the category on their banner. */}
          {notice.categoryName && notice.imageUrl && <CategoryTag name={notice.categoryName} />}
          {notice.deadline && <DeadlineBadge deadline={notice.deadline} />}
        </div>
        <h3 className="ucpnb-card-title">{notice.title}</h3>
        <p className="ucpnb-card-excerpt">{notice.description}</p>

        <div className="ucpnb-card-footer">
          <div className="ucpnb-card-source" title={notice.createdByName}>
            <Avatar name={notice.createdByName} />
            <span className="ucpnb-card-author">{notice.createdByName}</span>
          </div>

          <div className="ucpnb-card-actions">
            <button
              className="ucpnb-icon-btn ucpnb-icon-btn-sm"
              onClick={handleShare}
              aria-label={shared ? "Link copied" : "Share"}
              title={shared ? "Link copied" : "Share"}
            >
              <Icon name={shared ? "check" : "share"} size={17} />
            </button>
            {onDismiss && (
              <button
                className="ucpnb-icon-btn ucpnb-icon-btn-sm"
                onClick={(e) => {
                  stop(e);
                  onDismiss(notice);
                }}
                aria-label="Archive"
                title="Archive"
              >
                <Icon name="archive" size={17} />
              </button>
            )}
            {onRestore && (
              <button
                className="ucpnb-btn ucpnb-btn-secondary ucpnb-btn-sm"
                onClick={(e) => {
                  stop(e);
                  onRestore(notice);
                }}
              >
                <Icon name="restore" size={15} />
                Restore
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
