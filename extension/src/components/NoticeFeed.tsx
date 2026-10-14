import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@shared/api/client";
import type { Category, Notice } from "@shared/types";
import { NoticeCard } from "@shared/components/NoticeCard";
import { NoticeDetailModal } from "@shared/components/NoticeDetailModal";
import { Icon } from "@shared/components/Icon";
import { EmptyState } from "@shared/components/EmptyState";

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

  const [showHidden, setShowHidden] = useState(false);
  const [dismissedNotices, setDismissedNotices] = useState<Notice[]>([]);
  const [dismissedLoading, setDismissedLoading] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

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
      setNotices((prev) => prev.map((n) => (n.id === notice.id ? notice : n)));
      setSelected((prev) => (prev?.id === notice.id ? notice : prev));
    });
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
    // Bring it straight back into the main feed too, in the right position,
    // rather than waiting for a full reload to notice it's back.
    setNotices((prev) =>
      [notice, ...prev.filter((n) => n.id !== notice.id)].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
    api.restoreNotice(notice.id, token).catch(() => {
      /* if this fails, it just stays hidden until the next reload — not critical */
    });
  };

  const scrollCarousel = (direction: 1 | -1) => {
    const el = carouselRef.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="ucpnb-carousel">
        {[0, 1, 2, 3].map((i) => (
          <div className="ucpnb-card ucpnb-card-skeleton" key={i}>
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
      {categories.length > 0 && (
        <div className="ucpnb-chips" aria-label="Categories">
          <button className={categoryId === "all" ? "ucpnb-chip is-active" : "ucpnb-chip"} onClick={() => setCategoryId("all")}>
            All
          </button>
          {categories.map((c) => (
            <button key={c.id} className={categoryId === c.id ? "ucpnb-chip is-active" : "ucpnb-chip"} onClick={() => setCategoryId(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
      )}
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
          <button className="ucpnb-btn ucpnb-btn-secondary ucpnb-btn-sm" onClick={() => setShowGrid(true)}>
            <Icon name="grid" size={15} />
            View all
          </button>
          <button className="ucpnb-icon-btn ucpnb-icon-btn-sm ucpnb-icon-btn-outlined" onClick={openHidden} aria-label="Hidden notices" title="Hidden notices">
            <Icon name="eyeOff" size={16} />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        empty
      ) : (
        <div className="ucpnb-carousel-wrap">
          <button className="ucpnb-icon-btn ucpnb-carousel-nav is-prev" onClick={() => scrollCarousel(-1)} aria-label="Previous notices">
            <Icon name="chevronLeft" />
          </button>
          <div className="ucpnb-carousel" ref={carouselRef}>
            {filtered.map((notice) => (
              <NoticeCard key={notice.id} notice={notice} onView={handleView} onDismiss={handleDismiss} onLike={handleLike} imageWidth={CARD_IMAGE_WIDTH} />
            ))}
          </div>
          <button className="ucpnb-icon-btn ucpnb-carousel-nav is-next" onClick={() => scrollCarousel(1)} aria-label="More notices">
            <Icon name="chevronRight" />
          </button>
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
                    <NoticeCard key={notice.id} notice={notice} onView={handleView} onDismiss={handleDismiss} onLike={handleLike} imageWidth={CARD_IMAGE_WIDTH} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showHidden && (
        <div className="ucpnb-overlay" onClick={() => setShowHidden(false)}>
          <div className="ucpnb-sheet ucpnb-sheet-wide" role="dialog" aria-modal="true" aria-label="Hidden notices" onClick={(e) => e.stopPropagation()}>
            <div className="ucpnb-sheet-header">
              <h3>Hidden notices</h3>
              <button className="ucpnb-icon-btn" onClick={() => setShowHidden(false)} aria-label="Close">
                <Icon name="x" />
              </button>
            </div>
            <div className="ucpnb-sheet-content">
              <p className="ucpnb-sheet-text">Only hidden for you. Restore one to bring it back to your feed.</p>
              {dismissedLoading ? (
                <div className="ucpnb-skeleton" style={{ height: 120 }} />
              ) : dismissedNotices.length === 0 ? (
                <EmptyState icon="eyeOff" title="Nothing hidden">
                  Use the hide icon on a notice to tuck it away.
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
        <NoticeDetailModal notice={selected} onClose={() => setSelected(null)} onLike={handleLike} imageWidth={MODAL_IMAGE_WIDTH} />
      )}
    </>
  );
}
