import { useEffect, useMemo, useRef, useState } from "react";
import { useBackToClose } from "../backLayers";
import { useReveal } from "../reveal";
import { api } from "@shared/api/client";
import type { Category, Notice } from "@shared/types";
import { NoticeCard } from "@shared/components/NoticeCard";
import { NoticeListItem } from "./NoticeListItem";
import { NoticeDetailModal } from "@shared/components/NoticeDetailModal";
import { NoticeSkeleton } from "./NoticeSkeleton";
import { Icon } from "@shared/components/Icon";
import { EmptyState } from "@shared/components/EmptyState";
import { CategoryMenu } from "@shared/components/CategoryMenu";
import { isPhoneLayout } from "../phoneLayout";
import { compareNotices } from "@shared/noticeForm";

interface Props {
  token: string;
  initialNotices?: Notice[];
  initialCategories?: Category[];
  deepLinkNoticeId?: number;
  /** List or cards: chosen in the toolbar on computers, in the account menu on phones. */
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export type ViewMode = "card" | "list";
const VIEW_MODE_KEY = "ucpnb_viewMode";

const SWIPE_DEMO_KEY = "ucpnb_swipeDemoSeen";

/**
 * The view someone last picked; until they pick one, phones get the list
 * (more notices per screen, and swipe-to-archive) and wider screens the
 * cards.
 */
export function getSavedViewMode(): ViewMode {
  const saved = localStorage.getItem(VIEW_MODE_KEY);
  if (saved === "list" || saved === "card") return saved;
  return isPhoneLayout() ? "list" : "card";
}

/** Remembers the chosen view for next time. */
export function saveViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // Not remembered, but still applied for this visit.
  }
}

export function NoticeFeed({ token, initialNotices, initialCategories, deepLinkNoticeId, viewMode, onViewModeChange }: Props) {
  const [notices, setNotices] = useState<Notice[]>(initialNotices ?? []);
  const [categories, setCategories] = useState<Category[]>(initialCategories ?? []);
  const [loading, setLoading] = useState(!initialNotices);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Notice | null>(null);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  // First time in the list: the top row slides aside once to show that
  // swiping right archives a notice.
  const [swipeDemoSeen, setSwipeDemoSeen] = useState(() => localStorage.getItem(SWIPE_DEMO_KEY) === "1");
  const markSwipeDemoSeen = () => {
    localStorage.setItem(SWIPE_DEMO_KEY, "1");
    setSwipeDemoSeen(true);
  };

  const [showArchive, setShowArchive] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  // Back gesture closes these instead of leaving the app.
  useBackToClose(selected !== null, () => setSelected(null));
  useBackToClose(showArchive, () => setShowArchive(false));
  const [dismissedNotices, setDismissedNotices] = useState<Notice[]>([]);
  const [dismissedLoading, setDismissedLoading] = useState(false);

  useEffect(() => {
    if (initialNotices) return;

    let cancelled = false;
    setLoading(true);
    Promise.all([api.getNotices(token), api.getCategories(token)])
      .then(([noticesResult, categoriesResult]) => {
        if (!cancelled) {
          setNotices(noticesResult);
          setCategories(categoriesResult);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load notices.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!deepLinkNoticeId) return;
    api
      .getNotice(deepLinkNoticeId, token)
      .then(setSelected)
      .catch(() => {
        /* notice may have been deleted since the link was shared — just show the normal feed */
      });
  }, [deepLinkNoticeId, token]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return notices.filter((n) => {
      const matchesSearch =
        !query ||
        n.title.toLowerCase().includes(query) ||
        n.description.toLowerCase().includes(query);
      const matchesCategory = categoryId === "all" || n.categoryId === categoryId;
      return matchesSearch && matchesCategory;
    });
  }, [notices, search, categoryId]);
  useReveal(feedRef, [filtered, viewMode, loading]);

  const handleView = (notice: Notice) => {
    setSelected(notice);
    // Fire-and-forget — the detail view is already shown from the
    // already-held object above; this just records that it happened,
    // without making the person wait on it.
    api.recordView(notice.id, token).catch(() => {
      /* non-critical */
    });
  };

  const handleDismiss = (notice: Notice) => {
    setNotices((prev) => prev.filter((n) => n.id !== notice.id));
    api.dismissNotice(notice.id, token).catch(() => {
      /* if this fails, it just reappears on the next reload — not critical */
    });
  };

  const handleViewModeChange = onViewModeChange;

  const openArchive = () => {
    setShowArchive(true);
    setDismissedLoading(true);
    api
      .getDismissedNotices(token)
      .then(setDismissedNotices)
      .catch(() => setDismissedNotices([]))
      .finally(() => setDismissedLoading(false));
  };

  const handleRestore = (notice: Notice) => {
    setDismissedNotices((prev) => prev.filter((n) => n.id !== notice.id));
    setNotices((prev) =>
      [notice, ...prev.filter((n) => n.id !== notice.id)].sort(compareNotices)
    );
    api.restoreNotice(notice.id, token).catch(() => {
      /* if this fails, it just stays hidden until the next reload — not critical */
    });
  };

  if (error) {
    return (
      <EmptyState icon="inbox" title="Couldn't load notices">
        Check your connection and pull to refresh.
      </EmptyState>
    );
  }

  const hasFilters = search.trim() !== "" || categoryId !== "all";

  return (
    <>
      <div className="ucpnb-toolbar">
        <div className="ucpnb-toolbar-row">
          <label className="ucpnb-search">
            <Icon name="search" size={18} />
            <input
              className="ucpnb-input"
              type="search"
              placeholder="Search notices"
              aria-label="Search notices"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          {/* Computers get the category menu here; phones get the swipeable row below. */}
          {categories.length > 0 && (
            <div className="ucpnb-pointer-only">
              <CategoryMenu categories={categories} value={categoryId} onChange={setCategoryId} />
            </div>
          )}
          {/* Phones choose this in the account menu, to keep this row short. */}
          <div className="ucpnb-segmented ucpnb-pointer-flex" role="group" aria-label="Layout">
            <button
              className={viewMode === "card" ? "is-active" : ""}
              onClick={() => handleViewModeChange("card")}
              aria-label="Card view"
              aria-pressed={viewMode === "card"}
              title="Card view"
            >
              <Icon name="grid" size={17} />
            </button>
            <button
              className={viewMode === "list" ? "is-active" : ""}
              onClick={() => handleViewModeChange("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              title="List view"
            >
              <Icon name="list" size={17} />
            </button>
          </div>
          <button className="ucpnb-icon-btn ucpnb-icon-btn-outlined" onClick={openArchive} aria-label="Archived notices" title="Archived notices">
            <Icon name="archive" size={18} />
          </button>
        </div>

        {categories.length > 0 && (
          <div className="ucpnb-chips ucpnb-touch-only" role="tablist" aria-label="Categories">
            <button
              className={categoryId === "all" ? "ucpnb-chip is-active" : "ucpnb-chip"}
              onClick={() => setCategoryId("all")}
              role="tab"
              aria-selected={categoryId === "all"}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={categoryId === c.id ? "ucpnb-chip is-active" : "ucpnb-chip"}
                onClick={() => setCategoryId(c.id)}
                role="tab"
                aria-selected={categoryId === c.id}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <NoticeSkeleton viewMode={viewMode} />
      ) : filtered.length === 0 ? (
        hasFilters ? (
          <EmptyState icon="search" title="No matching notices">
            Try a different word or category.
          </EmptyState>
        ) : (
          <EmptyState icon="megaphone" title="You're all caught up">
            New notices from societies and departments will show up here.
          </EmptyState>
        )
      ) : viewMode === "list" ? (
        <div className="ucpnb-list" ref={feedRef}>
          {filtered.map((notice, i) => (
            <NoticeListItem
              key={notice.id}
              notice={notice}
              onView={handleView}
              onDismiss={(n) => {
                markSwipeDemoSeen();
                handleDismiss(n);
              }}
              onSwipeDemoDone={i === 0 && !swipeDemoSeen ? markSwipeDemoSeen : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="ucpnb-feed" ref={feedRef}>
          {filtered.map((notice) => (
            <NoticeCard key={notice.id} notice={notice} onView={handleView} onDismiss={handleDismiss} />
          ))}
        </div>
      )}

      {showArchive && (
        <div className="ucpnb-overlay" onClick={() => setShowArchive(false)}>
          <div className="ucpnb-sheet ucpnb-sheet-tall" role="dialog" aria-modal="true" aria-label="Archived notices" onClick={(e) => e.stopPropagation()}>
            <div className="ucpnb-sheet-header">
              <h3>Archive</h3>
              <button className="ucpnb-icon-btn" onClick={() => setShowArchive(false)} aria-label="Close">
                <Icon name="x" />
              </button>
            </div>
            <div className="ucpnb-sheet-content">
              <p className="ucpnb-sheet-text">Archiving only affects your own feed. Restore a notice to bring it back.</p>
              {dismissedLoading ? (
                <NoticeSkeleton viewMode="list" count={3} />
              ) : dismissedNotices.length === 0 ? (
                <EmptyState icon="archive" title="Nothing archived">
                  Swipe a notice right in list view, or tap the archive icon, to tuck it away.
                </EmptyState>
              ) : (
                <div className="ucpnb-feed ucpnb-feed-sheet">
                  {dismissedNotices.map((notice) => (
                    <NoticeCard key={notice.id} notice={notice} onView={handleView} onRestore={handleRestore} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selected && <NoticeDetailModal notice={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
