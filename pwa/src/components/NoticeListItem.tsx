import { useEffect, useState } from "react";
import { useSwipeable } from "react-swipeable";
import type { Notice } from "@shared/types";
import { optimizeImageUrl } from "@shared/imageOptimize";
import { categoryTone } from "@shared/format";
import { Icon } from "@shared/components/Icon";
import { DeadlineBadge, PinnedBadge } from "@shared/components/Tags";

interface Props {
  notice: Notice;
  onView: (notice: Notice) => void;
  onDismiss: (notice: Notice) => void;
  /**
   * Set on the first row for someone who hasn't seen it yet: the row
   * slides right to show the archive action underneath, then this is
   * called so it never plays again.
   */
  onSwipeDemoDone?: () => void;
}

// A swipe counts as "dismiss" if it travels far enough OR is a fast
// enough flick, even if it didn't travel the full distance — react-
// swipeable tracks velocity for us, which hand-rolled touch handling
// didn't account for.
const DISMISS_DISTANCE = 100;
const DISMISS_VELOCITY = 0.5;

export function NoticeListItem({ notice, onView, onDismiss, onSwipeDemoDone }: Props) {
  const [dragX, setDragX] = useState(0);
  const [dismissing, setDismissing] = useState(false);

  const [demo, setDemo] = useState(false);

  useEffect(() => {
    if (!onSwipeDemoDone) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onSwipeDemoDone();
      return;
    }
    // A moment after the feed appears, so it's noticed rather than missed.
    const start = setTimeout(() => setDemo(true), 700);
    return () => clearTimeout(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSwipeDemoDone != null]);

  const endDemo = () => {
    if (!demo) return;
    setDemo(false);
    onSwipeDemoDone?.();
  };

  const handlers = useSwipeable({
    onSwipeStart: endDemo,
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
    // Deliberately NOT preventing default here. The page itself has no
    // horizontal scroll to protect against (overflow-x: hidden), so
    // there's nothing to gain from it — but it WAS the reason vertical
    // scrolling silently stopped working in this view: it called
    // preventDefault on every tracked touchmove before the library could
    // even confirm the gesture was horizontal, which blocked normal
    // scrolling too. The drag visual (CSS transform below) still works
    // perfectly without it.
  });

  return (
    <div className="ucpnb-row-wrap">
      <div className="ucpnb-row-hint" aria-hidden="true">
        <Icon name="archive" size={18} />
        {demo ? "Swipe right to archive" : "Archive"}
      </div>
      <div
        {...handlers}
        className={demo ? "ucpnb-row ucpnb-row-demo" : "ucpnb-row"}
        onAnimationEnd={endDemo}
        role="button"
        tabIndex={0}
        aria-label={notice.title}
        style={{
          transform: `translateX(${dismissing ? "100%" : `${dragX}px`})`,
          opacity: dismissing ? 0 : 1,
        }}
        onClick={() => dragX === 0 && onView(notice)}
        onKeyDown={(e) => e.key === "Enter" && onView(notice)}
      >
        <div className={`ucpnb-row-thumb${notice.imageUrl ? "" : ` ucpnb-tone-${categoryTone(notice.categoryName ?? notice.title)}`}`}>
          {notice.imageUrl ? (
            <img src={optimizeImageUrl(notice.imageUrl, 160) ?? undefined} alt="" loading="lazy" />
          ) : (
            <Icon name="megaphone" size={22} />
          )}
        </div>
        <div className="ucpnb-row-body">
          <div className="ucpnb-row-meta">
            {notice.isPinned && <PinnedBadge />}
            {notice.categoryName && <span className={`ucpnb-row-category ucpnb-tone-text-${categoryTone(notice.categoryName)}`}>{notice.categoryName}</span>}
            {notice.deadline && <DeadlineBadge deadline={notice.deadline} />}
          </div>
          <h3 className="ucpnb-row-title">{notice.title}</h3>
          <div className="ucpnb-row-source">
            <span>{notice.createdByName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
