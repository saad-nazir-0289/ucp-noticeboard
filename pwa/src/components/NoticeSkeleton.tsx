interface Props {
  viewMode: "card" | "list";
}

export function NoticeSkeleton({ viewMode }: Props) {
  const count = viewMode === "card" ? 4 : 6;
  const items = Array.from({ length: count }, (_, i) => i);

  if (viewMode === "list") {
    return (
      <div className="ucpnb-list">
        {items.map((i) => (
          <div className="ucpnb-skeleton-list-item" key={i}>
            <div className="ucpnb-skeleton ucpnb-skeleton-thumb" />
            <div className="ucpnb-skeleton-list-lines">
              <div className="ucpnb-skeleton ucpnb-skeleton-line" style={{ width: "40%" }} />
              <div className="ucpnb-skeleton ucpnb-skeleton-line" style={{ width: "75%" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="ucpnb-feed">
      {items.map((i) => (
        <div className="ucpnb-skeleton-card" key={i}>
          <div className="ucpnb-skeleton ucpnb-skeleton-image" />
          <div className="ucpnb-skeleton-card-body">
            <div className="ucpnb-skeleton ucpnb-skeleton-line" style={{ width: "35%" }} />
            <div className="ucpnb-skeleton ucpnb-skeleton-line" style={{ width: "85%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
