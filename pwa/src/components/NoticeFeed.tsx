import { useEffect, useMemo, useState } from "react";
import { api } from "@shared/api/client";
import type { Category, Notice } from "@shared/types";
import { NoticeCard } from "@shared/components/NoticeCard";
import { NoticeListItem } from "./NoticeListItem";
import { NoticeDetailModal } from "@shared/components/NoticeDetailModal";
import { NoticeSkeleton } from "./NoticeSkeleton";
import { Icon } from "@shared/components/Icon";
import { EmptyState } from "@shared/components/EmptyState";

interface Props {
  token: string;
  initialNotices?: Notice[];
  initialCategories?: Category[];
  deepLinkNoticeId?: number;
}

export type ViewMode = "card" | "list";
const VIEW_MODE_KEY = "ucpnb_viewMode";

export function getSavedViewMode(): ViewMode {
  const saved = localStorage.getItem(VIEW_MODE_KEY);
  return saved === "list" ? "list" : "card";
}

export function NoticeFeed({ token, initialNotices, initialCategories, deepLinkNoticeId }: Props) {
  const [notices, setNotices] = useState<Notice[]>(initialNotices ?? []);
  const [categories, setCategories] = useState<Category[]>(initialCategories ?? []);
  const [loading, setLoading] = useState(!initialNotices);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Notice | null>(null);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>(getSavedViewMode);

  const [showHidden, setShowHidden] = useState(false);
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

  const handleLike = (notice: Notice) => {
    const wasLiked = notice.likedByMe;
    const toggled: Notice = {
      ...notice,
      likedByMe: !wasLiked,
      likeCount: notice.likeCount + (wasLiked ? -1 : 1),
    };

    setNotices((prev) => prev.map((n) => (n.id === notice.id ? toggled : n)));
    setSelected((prev) => (prev?.id === notice.id ? toggled : prev));

    const apiCall = wasLiked ? api.unlikeNotice : api.likeNotice;
    apiCall(notice.id, token).catch(() => {
      // Revert on failure — the optimistic update above assumed success.
      setNotices((prev) => prev.map((n) => (n.id === notice.id ? notice : n)));
      setSelected((prev) => (prev?.id === notice.id ? notice : prev));
    });
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  const openHidden = () => {
    setShowHidden(true);
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
      [notice, ...prev.filter((n) => n.id !== notice.id)].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
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
          <div className="ucpnb-segmented" role="group" aria-label="Layout">
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
          <button className="ucpnb-icon-btn ucpnb-icon-btn-outlined" onClick={openHidden} aria-label="Hidden notices" title="Hidden notices">
            <Icon name="eyeOff" size={18} />
          </button>
        </div>

        {categories.length > 0 && (
          <div className="ucpnb-chips" role="tablist" aria-label="Categories">
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
        <div className="ucpnb-list">
          {filtered.map((notice) => (
            <NoticeListItem key={notice.id} notice={notice} onView={handleView} onDismiss={handleDismiss} onLike={handleLike} />
          ))}
        </div>
      ) : (
        <div className="ucpnb-feed">
          {filtered.map((notice) => (
            <NoticeCard key={notice.id} notice={notice} onView={handleView} onDismiss={handleDismiss} onLike={handleLike} />
          ))}
        </div>
      )}

      {showHidden && (
        <div className="ucpnb-overlay" onClick={() => setShowHidden(false)}>
          <div className="ucpnb-sheet ucpnb-sheet-tall" role="dialog" aria-modal="true" aria-label="Hidden notices" onClick={(e) => e.stopPropagation()}>
            <div className="ucpnb-sheet-header">
              <h3>Hidden notices</h3>
              <button className="ucpnb-icon-btn" onClick={() => setShowHidden(false)} aria-label="Close">
                <Icon name="x" />
              </button>
            </div>
            <div className="ucpnb-sheet-content">
              <p className="ucpnb-sheet-text">Only hidden for you. Restore one to bring it back to your feed.</p>
              {dismissedLoading ? (
                <NoticeSkeleton viewMode="list" count={3} />
              ) : dismissedNotices.length === 0 ? (
                <EmptyState icon="eyeOff" title="Nothing hidden">
                  Swipe a notice right in list view, or tap the hide icon, to tuck it away.
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

      {selected && <NoticeDetailModal notice={selected} onClose={() => setSelected(null)} onLike={handleLike} />}
    </>
  );
}
