import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@shared/api/client";
import type { Category, Notice } from "@shared/types";
import { NoticeCard } from "@shared/components/NoticeCard";
import { NoticeDetailModal } from "@shared/components/NoticeDetailModal";
import { Icon } from "@shared/components/Icon";
import { EmptyState } from "@shared/components/EmptyState";
import { CategoryMenu } from "@shared/components/CategoryMenu";
import { compareNotices } from "@shared/noticeForm";

// Desktop cards and the modal are narrower than the PWA's, so request smaller posters.
const CARD_IMAGE_WIDTH = 400;
const MODAL_IMAGE_WIDTH = 700;

interface Props {
  token: string;
  initialNotices?: Notice[];
  initialCategories?: Category[];
}

export function NoticeFeed({ token, initialNotices, initialCategories }: Props) {
  const [notices, setNotices] = useState<Notice[]>(initialNotices ?? []);
  const [categories, setCategories] = useState<Category[]>(initialCategories ?? []);
  const [loading, setLoading] = useState(!initialNotices);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Notice | null>(null);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [showGrid, setShowGrid] = useState(false);

  const [showArchive, setShowArchive] = useState(false);
  const [dismissedNotices, setDismissedNotices] = useState<Notice[]>([]);
  const [dismissedLoading, setDismissedLoading] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  // Whether there's more to scroll to on each side: shows that side's
  // arrow and soft edge (the scrollbar itself is hidden).
  const [edges, setEdges] = useState({ prev: false, next: false });

  useEffect(() => {
    // Already have data from the login bootstrap — nothing to fetch on
    // mount. This is the whole point: first paint costs zero extra
    // round trips when bootstrap data was provided.
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
    api.recordView(notice.id, token).catch(() => {
      /* non-critical */
    });
  };

  const handleDismiss = (notice: Notice) => {
    // Optimistic: remove immediately, don't make the user wait on a request
    // just to hide something they've already decided they don't want to see.
    setNotices((prev) => prev.filter((n) => n.id !== notice.id));
    api.dismissNotice(notice.id, token).catch(() => {
      /* if this fails, it just reappears on the next reload — not critical */
    });
  };

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
    // Bring it straight back into the main feed too, in the right position,
    // rather than waiting for a full reload to notice it's back.
    setNotices((prev) =>
      [notice, ...prev.filter((n) => n.id !== notice.id)].sort(compareNotices)
    );
    api.restoreNotice(notice.id, token).catch(() => {
      /* if this fails, it just stays hidden until the next reload — not critical */
    });
  };

  const scrollCarousel = (direction: 1 | -1) => {
    const el = carouselRef.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  const updateEdges = () => {
    const el = carouselRef.current;
    if (!el) return;
    const prev = el.scrollLeft > 4;
    const next = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setEdges((e) => (e.prev === prev && e.next === next ? e : { prev, next }));
  };

  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [filtered, loading]);

  if (loading) {
    return (
      <div className="ucpnb-carousel">
        {[0, 1, 2, 3].map((i) => (
          <div className="ucpnb-card ucpnb-card-skeleton" key={i}>
              <div className="ucpnb-skeleton ucpnb-card-media" style={{ borderRadius: 0 }} />
            <div className="ucpnb-card-body">
              <div className="ucpnb-skeleton" style={{ width: "35%", height: 18 }} />
              <div className="ucpnb-skeleton" style={{ width: "90%", height: 16 }} />
              <div className="ucpnb-skeleton" style={{ width: "100%", height: 12 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState icon="inbox" title="Couldn't load notices">
        Try reloading the page in a minute.
      </EmptyState>
    );
  }

  const hasFilters = search.trim() !== "" || categoryId !== "all";

  const filters = (
    <div className="ucpnb-filters">
      <label className="ucpnb-search">
        <Icon name="search" size={17} />
        <input
          className="ucpnb-input"
          type="search"
          placeholder="Search notices"
          aria-label="Search notices"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {categories.length > 0 && <CategoryMenu categories={categories} value={categoryId} onChange={setCategoryId} />}
    </div>
  );

  const empty = hasFilters ? (
    <EmptyState icon="search" title="No matching notices">
      Try a different word or category.
    </EmptyState>
  ) : (
    <EmptyState icon="megaphone" title="You're all caught up">
      New notices from societies and departments will show up here.
    </EmptyState>
  );

  return (
    <>
      <div className="ucpnb-feed-toolbar">
        {filters}
        <div className="ucpnb-feed-toolbar-actions">
          <button className="ucpnb-btn ucpnb-btn-ghost ucpnb-btn-sm" onClick={() => setShowGrid(true)}>
            View all
          </button>
          <button className="ucpnb-icon-btn ucpnb-icon-btn-sm" onClick={openArchive} aria-label="Archived notices" title="Archived notices">
            <Icon name="archive" size={16} />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        empty
      ) : (
        <div className={`ucpnb-carousel-wrap${edges.prev ? " can-prev" : ""}${edges.next ? " can-next" : ""}`}>
          {edges.prev && (
            <button className="ucpnb-icon-btn ucpnb-carousel-nav is-prev" onClick={() => scrollCarousel(-1)} aria-label="Previous notices">
              <Icon name="chevronLeft" />
            </button>
          )}
          <div className="ucpnb-carousel" ref={carouselRef} onScroll={updateEdges}>
            {filtered.map((notice) => (
              <NoticeCard key={notice.id} notice={notice} onView={handleView} onDismiss={handleDismiss} imageWidth={CARD_IMAGE_WIDTH} />
            ))}
          </div>
          {edges.next && (
            <button className="ucpnb-icon-btn ucpnb-carousel-nav is-next" onClick={() => scrollCarousel(1)} aria-label="More notices">
              <Icon name="chevronRight" />
            </button>
          )}
        </div>
      )}

      {showGrid && (
        <div className="ucpnb-overlay" onClick={() => setShowGrid(false)}>
          <div className="ucpnb-sheet ucpnb-sheet-wide" role="dialog" aria-modal="true" aria-label="All notices" onClick={(e) => e.stopPropagation()}>
            <div className="ucpnb-sheet-header">
              <h3>All notices</h3>
              <button className="ucpnb-icon-btn" onClick={() => setShowGrid(false)} aria-label="Close">
                <Icon name="x" />
              </button>
            </div>
            <div className="ucpnb-sheet-content">
              {filters}
              {filtered.length === 0 ? (
                empty
              ) : (
                <div className="ucpnb-grid">
                  {filtered.map((notice) => (
                    <NoticeCard key={notice.id} notice={notice} onView={handleView} onDismiss={handleDismiss} imageWidth={CARD_IMAGE_WIDTH} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showArchive && (
        <div className="ucpnb-overlay" onClick={() => setShowArchive(false)}>
          <div className="ucpnb-sheet ucpnb-sheet-wide" role="dialog" aria-modal="true" aria-label="Archived notices" onClick={(e) => e.stopPropagation()}>
            <div className="ucpnb-sheet-header">
              <h3>Archive</h3>
              <button className="ucpnb-icon-btn" onClick={() => setShowArchive(false)} aria-label="Close">
                <Icon name="x" />
              </button>
            </div>
            <div className="ucpnb-sheet-content">
              <p className="ucpnb-sheet-text">Archiving only affects your own feed. Restore a notice to bring it back.</p>
              {dismissedLoading ? (
                <div className="ucpnb-skeleton" style={{ height: 120 }} />
              ) : dismissedNotices.length === 0 ? (
                <EmptyState icon="archive" title="Nothing archived">
                  Use the archive icon on a notice to tuck it away.
                </EmptyState>
              ) : (
                <div className="ucpnb-grid">
                  {dismissedNotices.map((notice) => (
                    <NoticeCard key={notice.id} notice={notice} onView={handleView} onRestore={handleRestore} imageWidth={CARD_IMAGE_WIDTH} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selected && (
        <NoticeDetailModal notice={selected} onClose={() => setSelected(null)} imageWidth={MODAL_IMAGE_WIDTH} />
      )}
    </>
  );
}
