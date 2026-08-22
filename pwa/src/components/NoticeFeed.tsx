import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Category, Notice } from "../types";
import { NoticeCard } from "./NoticeCard";
import { NoticeListItem } from "./NoticeListItem";
import { NoticeDetailModal } from "./NoticeDetailModal";
import { NoticeSkeleton } from "./NoticeSkeleton";

interface Props {
  token: string;
  initialNotices?: Notice[];
  initialCategories?: Category[];
  deepLinkNoticeId?: number;
}

type ViewMode = "card" | "list";
const VIEW_MODE_KEY = "ucpnb_viewMode";

function getSavedViewMode(): ViewMode {
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
  const [showGrid, setShowGrid] = useState(false);
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

  const handleDismiss = (notice: Notice) => {
    setNotices((prev) => prev.filter((n) => n.id !== notice.id));
    api.dismissNotice(notice.id, token).catch(() => {
      /* if this fails, it just reappears on the next reload — not critical */
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

  if (error) return <p className="ucpnb-error">{error}</p>;

  const toolbar = (
    <div className="ucpnb-toolbar">
      <input
        type="text"
        className="ucpnb-search"
        placeholder="Search notices..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="ucpnb-toolbar-row">
        {categories.length > 0 && (
          <select
            className="ucpnb-category-select"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <div className="ucpnb-view-toggle" role="group" aria-label="Choose view">
          <button
            className={viewMode === "card" ? "ucpnb-view-toggle-btn active" : "ucpnb-view-toggle-btn"}
            onClick={() => handleViewModeChange("card")}
            title="Card view"
          >
            ▦
          </button>
          <button
            className={viewMode === "list" ? "ucpnb-view-toggle-btn active" : "ucpnb-view-toggle-btn"}
            onClick={() => handleViewModeChange("list")}
            title="List view"
          >
            ☰
          </button>
        </div>
        <button className="ucpnb-btn ucpnb-btn-viewall" onClick={() => setShowGrid(true)}>
          View All
        </button>
        <button className="ucpnb-btn" onClick={openHidden}>
          Hidden
        </button>
      </div>
    </div>
  );

  return (
    <>
      {toolbar}

      {loading ? (
        <NoticeSkeleton viewMode={viewMode} />
      ) : filtered.length === 0 ? (
        <p className="ucpnb-status">
          {notices.length === 0 ? "No notices yet." : "No notices match your search/filter."}
        </p>
      ) : viewMode === "list" ? (
        <div className="ucpnb-list">
          {filtered.map((notice) => (
            <NoticeListItem key={notice.id} notice={notice} onView={setSelected} onDismiss={handleDismiss} />
          ))}
        </div>
      ) : (
        <div className="ucpnb-feed">
          {filtered.map((notice) => (
            <NoticeCard key={notice.id} notice={notice} onView={setSelected} onDismiss={handleDismiss} />
          ))}
        </div>
      )}

      {showGrid && (
        <div className="ucpnb-grid-overlay" onClick={() => setShowGrid(false)}>
          <div className="ucpnb-grid-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ucpnb-grid-header">
              <h3>All Notices</h3>
              <button className="ucpnb-modal-close" onClick={() => setShowGrid(false)} aria-label="Close">
                ×
              </button>
            </div>
            {toolbar}
            {filtered.length === 0 ? (
              <p className="ucpnb-status">No notices match your search/filter.</p>
            ) : (
              <div className="ucpnb-grid">
                {filtered.map((notice) => (
                  <NoticeCard key={notice.id} notice={notice} onView={setSelected} onDismiss={handleDismiss} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showHidden && (
        <div className="ucpnb-grid-overlay" onClick={() => setShowHidden(false)}>
          <div className="ucpnb-grid-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ucpnb-grid-header">
              <h3>Hidden Notices</h3>
              <button className="ucpnb-modal-close" onClick={() => setShowHidden(false)} aria-label="Close">
                ×
              </button>
            </div>
            <p className="ucpnb-status">
              Notices you've hidden from your own feed. Restoring one brings it back for you only.
            </p>
            {dismissedLoading ? (
              <p className="ucpnb-status">Loading...</p>
            ) : dismissedNotices.length === 0 ? (
              <p className="ucpnb-status">Nothing hidden right now.</p>
            ) : (
              <div className="ucpnb-grid">
                {dismissedNotices.map((notice) => (
                  <NoticeCard
                    key={notice.id}
                    notice={notice}
                    onView={setSelected}
                    onRestore={handleRestore}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {selected && (
        <NoticeDetailModal notice={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
