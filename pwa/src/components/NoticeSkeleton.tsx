interface Props {
  viewMode: "card" | "list";
  count?: number;
}

/** Placeholder shapes matching the real card/row layout while notices load. */
export function NoticeSkeleton({ viewMode, count }: Props) {
  const items = Array.from({ length: count ?? (viewMode === "card" ? 6 : 8) }, (_, i) => i);

  if (viewMode === "list") {
    return (
      <div className="ucpnb-list" aria-busy="true" aria-label="Loading notices">
        {items.map((i) => (
          <div className="ucpnb-row ucpnb-row-skeleton" key={i}>
            <div className="ucpnb-skeleton ucpnb-row-thumb" />
            <div className="ucpnb-row-body">
              <div className="ucpnb-skeleton" style={{ width: "30%", height: 10 }} />
              <div className="ucpnb-skeleton" style={{ width: "85%", height: 14 }} />
              <div className="ucpnb-skeleton" style={{ width: "45%", height: 10 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="ucpnb-feed" aria-busy="true" aria-label="Loading notices">
      {items.map((i) => (
        <div className="ucpnb-card ucpnb-card-skeleton" key={i}>
          <div className="ucpnb-skeleton ucpnb-card-media" style={{ borderRadius: 0 }} />
          <div className="ucpnb-card-body">
            <div className="ucpnb-skeleton" style={{ width: "28%", height: 18 }} />
            <div className="ucpnb-skeleton" style={{ width: "90%", height: 16 }} />
            <div className="ucpnb-skeleton" style={{ width: "100%", height: 12 }} />
            <div className="ucpnb-skeleton" style={{ width: "70%", height: 12 }} />
            <div className="ucpnb-card-footer">
              <div className="ucpnb-skeleton" style={{ width: "45%", height: 12 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
