import { useState } from "react";
import type { Notice } from "../types";
import { shareNotice } from "../share";
import { optimizeImageUrl } from "../imageOptimize";
import { timeAgo } from "../format";
import { Icon } from "./Icon";
import { Avatar, CategoryTag, DeadlineBadge } from "./Tags";

interface Props {
  notice: Notice;
  onView: (notice: Notice) => void;
  onDismiss?: (notice: Notice) => void;
  onRestore?: (notice: Notice) => void;
  onLike?: (notice: Notice) => void;
  /** Poster width to request from Cloudinary, sized to how wide this app shows cards. */
  imageWidth?: number;
}

/**
 * A notice in a feed. With a poster: poster on top. Without: a text card
 * with a short preview, so posterless notices look intentional rather
 * than like something failed to load.
 */
export function NoticeCard({ notice, onView, onDismiss, onRestore, onLike, imageWidth = 600 }: Props) {
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
      className={notice.imageUrl ? "ucpnb-card has-image" : "ucpnb-card"}
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
      {notice.imageUrl && (
        <div className="ucpnb-card-media">
          <div
            className="ucpnb-card-media-bg"
            style={{ backgroundImage: `url(${optimizeImageUrl(notice.imageUrl, 40)})` }}
            aria-hidden="true"
          />
          <img src={optimizeImageUrl(notice.imageUrl, imageWidth) ?? undefined} alt="" loading="lazy" />
        </div>
      )}

      <div className="ucpnb-card-body">
        {(notice.categoryName || notice.deadline) && (
          <div className="ucpnb-card-tags">
            {notice.categoryName && <CategoryTag name={notice.categoryName} />}
            {notice.deadline && <DeadlineBadge deadline={notice.deadline} />}
          </div>
        )}
        <h3 className="ucpnb-card-title">{notice.title}</h3>
        <p className="ucpnb-card-excerpt">{notice.description}</p>

        <div className="ucpnb-card-footer">
          <div className="ucpnb-card-source" title={notice.createdByName}>
            <Avatar name={notice.createdByName} />
            <span className="ucpnb-card-author">{notice.createdByName}</span>
            <span className="ucpnb-dot" aria-hidden="true" />
            <time dateTime={notice.createdAt}>{timeAgo(notice.createdAt)}</time>
          </div>

          <div className="ucpnb-card-actions">
            {onLike && (
              <button
                className={notice.likedByMe ? "ucpnb-like is-liked" : "ucpnb-like"}
                onClick={(e) => {
                  stop(e);
                  onLike(notice);
                }}
                aria-label={notice.likedByMe ? "Unlike" : "Like"}
                aria-pressed={notice.likedByMe}
              >
                <Icon name="heart" size={17} filled={notice.likedByMe} />
                <span>{notice.likeCount}</span>
              </button>
            )}
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
                aria-label="Hide from my feed"
                title="Hide from my feed"
              >
                <Icon name="eyeOff" size={17} />
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
