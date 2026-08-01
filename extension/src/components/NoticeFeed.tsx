import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Category, Notice } from "../types";
import { NoticeCard } from "./NoticeCard";
import { NoticeDetailModal } from "./NoticeDetailModal";

interface Props {
  token: string;
}

export function NoticeFeed({ token }: Props) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Notice | null>(null);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [showGrid, setShowGrid] = useState(false);

  useEffect(() => {
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
  }, [token]);

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
    // Optimistic: remove immediately, don't make the user wait on a request
    // just to hide something they've already decided they don't want to see.
    setNotices((prev) => prev.filter((n) => n.id !== notice.id));
    api.dismissNotice(notice.id, token).catch(() => {
      /* if this fails, it just reappears on the next reload — not critical */
    });
  };

  if (loading) return <p className="ucpnb-status">Loading notices...</p>;
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
      <button className="ucpnb-btn" onClick={() => setShowGrid(true)}>
        View All
      </button>
    </div>
  );

  return (
    <>
      {toolbar}

      {filtered.length === 0 ? (
        <p className="ucpnb-status">
          {notices.length === 0 ? "No notices yet." : "No notices match your search/filter."}
        </p>
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

      {selected && (
        <NoticeDetailModal notice={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
