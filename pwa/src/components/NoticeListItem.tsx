import { useState } from "react";
import { useSwipeable } from "react-swipeable";
import type { Notice } from "../types";
import { shareNotice } from "../share";
import { optimizeImageUrl } from "../imageOptimize";

interface Props {
  notice: Notice;
  onView: (notice: Notice) => void;
  onDismiss: (notice: Notice) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// A swipe counts as "dismiss" if it travels far enough OR is a fast
// enough flick, even if it didn't travel the full distance — react-
// swipeable tracks velocity for us, which hand-rolled touch handling
// didn't account for.
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 0.5;

export function NoticeListItem({ notice, onView, onDismiss }: Props) {
  const [dragX, setDragX] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const [shared, setShared] = useState(false);

  const handlers = useSwipeable({
    onSwiping: (eventData) => {
      // Only dragging right does anything — left stays put at 0.
      if (eventData.dir === "Right") {
        setDragX(eventData.deltaX);
      }
    },
    onSwiped: (eventData) => {
      const isRight = eventData.dir === "Right";
      const pastThreshold = eventData.absX > DISMISS_DISTANCE || eventData.velocity > DISMISS_VELOCITY;

      if (isRight && pastThreshold) {
        setDismissing(true);
        // Let the slide-out animation finish before actually removing it
        // from the list, so it doesn't just vanish mid-swipe.
        setTimeout(() => onDismiss(notice), 180);
      } else {
        setDragX(0);
      }
    },
    trackMouse: true, // lets this be tested with a mouse on desktop too
    preventScrollOnSwipe: true,
  });

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const result = await shareNotice(notice);
    if (result === "copied") {
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  return (
    <div className="ucpnb-list-item-wrap">
      <div className="ucpnb-list-item-hint" aria-hidden="true">
        Hidden
      </div>
      <div
        {...handlers}
        className="ucpnb-list-item"
        style={{
          transform: `translateX(${dismissing ? "100%" : `${dragX}px`})`,
          opacity: dismissing ? 0 : 1,
        }}
        onClick={() => dragX === 0 && onView(notice)}
      >
        <div className="ucpnb-list-item-thumb">
          {notice.imageUrl ? (
            <img src={optimizeImageUrl(notice.imageUrl, 120) ?? undefined} alt="" loading="lazy" />
          ) : (
            <span aria-hidden="true">📌</span>
          )}
        </div>
        <div className="ucpnb-list-item-body">
          {notice.categoryName && <span className="ucpnb-card-category">{notice.categoryName}</span>}
          <h4 className="ucpnb-list-item-title">{notice.title}</h4>
          {notice.deadline && (
            <span className="ucpnb-card-deadline">Deadline: {formatDate(notice.deadline)}</span>
          )}
        </div>
        <button
          className="ucpnb-list-item-share"
          aria-label="Share this notice"
          title={shared ? "Link copied!" : "Share this notice"}
          onClick={handleShare}
        >
          {shared ? "✓" : "🔗"}
        </button>
      </div>
    </div>
  );
}
