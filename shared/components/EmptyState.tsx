import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** Centred icon + headline + hint, for "nothing here" moments. */
export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="ucpnb-empty">
      <span className="ucpnb-empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
