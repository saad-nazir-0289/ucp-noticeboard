import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Notice } from "../types";
import { NoticeCard } from "./NoticeCard";
import { NoticeDetailModal } from "./NoticeDetailModal";

interface Props {
  token: string;
}

export function NoticeFeed({ token }: Props) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getNotices(token)
      .then((data) => {
        if (!cancelled) setNotices(data);
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

  if (loading) return <p className="ucpnb-status">Loading notices...</p>;
  if (error) return <p className="ucpnb-error">{error}</p>;
  if (notices.length === 0) return <p className="ucpnb-status">No notices yet.</p>;

  return (
    <>
      <div className="ucpnb-feed">
        {notices.map((notice) => (
          <NoticeCard key={notice.id} notice={notice} onView={setSelected} />
        ))}
      </div>
      {selected && (
        <NoticeDetailModal notice={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
