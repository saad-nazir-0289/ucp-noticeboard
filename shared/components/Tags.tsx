import { categoryTone, deadlineStatus, initials } from "../format";
import { Icon } from "./Icon";

/** A category label, coloured consistently per category name. */
export function CategoryTag({ name }: { name: string }) {
  return <span className={`ucpnb-tag ucpnb-tone-${categoryTone(name)}`}>{name}</span>;
}

/** "Due tomorrow" (amber), "5h left" (red), "Closed" (grey)... */
export function DeadlineBadge({ deadline, now }: { deadline: string; now?: Date }) {
  const { label, tone } = deadlineStatus(deadline, now);
  return (
    <span className={`ucpnb-badge ucpnb-badge-${tone}`}>
      <Icon name="clock" size={12} strokeWidth={2.4} />
      {label}
    </span>
  );
}

/** Round initials badge for whoever posted a notice. */
export function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span className={`ucpnb-avatar ucpnb-avatar-${size} ucpnb-tone-${categoryTone(name)}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
