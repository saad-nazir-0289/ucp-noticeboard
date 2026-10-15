import { Fragment, useEffect, useState } from "react";
import type { Notice } from "../types";
import { shareNotice } from "../share";
import { optimizeImageUrl } from "../imageOptimize";
import { formatDateTime, toParagraphs } from "../format";
import { downloadIcs, googleCalendarUrl } from "../calendar";
import { Icon } from "./Icon";
import { PosterViewer } from "./PosterViewer";
import { Avatar, CategoryTag, DeadlineBadge, PinnedBadge } from "./Tags";

interface Props {
  notice: Notice;
  onClose: () => void;
  /** Poster width to request from Cloudinary, sized to how wide this app shows the modal. */
  imageWidth?: number;
  /** Lets the app own whether the full-screen poster is open (the PWA closes it on Back). */
  posterOpen?: boolean;
  onPosterOpenChange?: (open: boolean) => void;
}

/** Full notice: a bottom sheet on phones, a centred dialog on wider screens. */
export function NoticeDetailModal({ notice, onClose, imageWidth = 900, posterOpen, onPosterOpenChange }: Props) {
  const [shared, setShared] = useState(false);
  const [ownPosterOpen, setOwnPosterOpen] = useState(false);
  const viewingPoster = posterOpen ?? ownPosterOpen;
  const setViewingPoster = onPosterOpenChange ?? setOwnPosterOpen;

  useEffect(() => {
    // While the poster is full screen, Escape closes only that.
    if (viewingPoster) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, viewingPoster]);

  const handleShare = async () => {
    const result = await shareNotice(notice);
    if (result === "copied") {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  return (
    <div className="ucpnb-overlay ucpnb-overlay-dialog" onClick={onClose}>
      <div
        className="ucpnb-sheet ucpnb-detail"
        role="dialog"
        aria-modal="true"
        aria-label={notice.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ucpnb-sheet-handle" aria-hidden="true" />
        <button className="ucpnb-icon-btn ucpnb-detail-close" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>

        {notice.imageUrl && (
          <div
            className="ucpnb-detail-media is-zoomable"
            role="button"
            tabIndex={0}
            aria-label="View the poster full screen"
            onClick={() => setViewingPoster(true)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setViewingPoster(true))}
          >
            <div
              className="ucpnb-card-media-bg"
              style={{ backgroundImage: `url(${optimizeImageUrl(notice.imageUrl, 60)})` }}
              aria-hidden="true"
            />
            <img src={optimizeImageUrl(notice.imageUrl, imageWidth) ?? undefined} alt="" />
            <span className="ucpnb-detail-media-zoom" aria-hidden="true">
              <Icon name="search" size={16} />
            </span>
          </div>
        )}

        <div className="ucpnb-detail-body">
          {(notice.isPinned || notice.categoryName || notice.deadline) && (
            <div className="ucpnb-card-tags">
              {notice.isPinned && <PinnedBadge />}
              {notice.categoryName && <CategoryTag name={notice.categoryName} />}
              {notice.deadline && <DeadlineBadge deadline={notice.deadline} />}
            </div>
          )}

          <h2 className="ucpnb-detail-title">{notice.title}</h2>

          <div className="ucpnb-detail-source">
            <Avatar name={notice.createdByName} size="md" imageUrl={notice.createdByLogoUrl} />
            <div>
              <strong>{notice.createdByName}</strong>
              {/* Only the Admin is ever sent view counts. */}
              {notice.viewCount != null && (
                <span>
                  {notice.viewCount} {notice.viewCount === 1 ? "view" : "views"}
                </span>
              )}
            </div>
          </div>

          {notice.deadline && (
            <div className="ucpnb-detail-info">
              <Icon name="calendar" size={18} />
              <div>
                <span>Deadline</span>
                <strong>{formatDateTime(notice.deadline)}</strong>
              </div>
            </div>
          )}

          <div className="ucpnb-detail-text">
            {toParagraphs(notice.description).map((lines, i) => (
              <p key={i}>
                {lines.map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {line}
                  </Fragment>
                ))}
              </p>
            ))}
          </div>

          {/* The last thing in the notice, once it's been read. */}
          {notice.deadline && new Date(notice.deadline) > new Date() && (
            <div className="ucpnb-detail-calendar">
              <span>Add the deadline to your calendar</span>
              <div className="ucpnb-calendar-actions">
                <a className="ucpnb-btn ucpnb-btn-secondary ucpnb-btn-sm" href={googleCalendarUrl(notice)} target="_blank" rel="noopener noreferrer">
                  <Icon name="plus" size={14} />
                  Google Calendar
                </a>
                <button className="ucpnb-btn ucpnb-btn-secondary ucpnb-btn-sm" onClick={() => downloadIcs(notice)} title="For Apple Calendar, Outlook and others">
                  <Icon name="calendar" size={14} />
                  Other calendars
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="ucpnb-detail-actions">
          {notice.linkUrl && (
            <a className="ucpnb-btn ucpnb-btn-primary ucpnb-btn-lg" href={notice.linkUrl} target="_blank" rel="noopener noreferrer">
              Open link
              <Icon name="externalLink" size={17} />
            </a>
          )}
          <div className="ucpnb-detail-secondary">
            <button className="ucpnb-btn ucpnb-btn-secondary" onClick={handleShare}>
              <Icon name={shared ? "check" : "share"} size={18} />
              {shared ? "Copied" : "Share"}
            </button>
          </div>
        </div>
      </div>

      {viewingPoster && notice.imageUrl && (
        <div onClick={(e) => e.stopPropagation()}>
          <PosterViewer
            src={optimizeImageUrl(notice.imageUrl, 1600) ?? notice.imageUrl}
            alt={notice.title}
            onClose={() => setViewingPoster(false)}
          />
        </div>
      )}
    </div>
  );
}
