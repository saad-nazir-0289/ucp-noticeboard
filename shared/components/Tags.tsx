import { categoryTone, deadlineStatus, initials } from "../format";
import { optimizeImageUrl } from "../imageOptimize";
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

/** Marks a notice the Admin pinned to the top of the feed. */
export function PinnedBadge() {
  return (
    <span className="ucpnb-badge ucpnb-badge-pinned">
      <Icon name="pin" size={12} strokeWidth={2.4} />
      Pinned
    </span>
  );
}

/**
 * The Admin's "Pin to top" switch in the notice forms. Renders nothing
 * for anyone else — the API ignores the flag from non-Admins anyway.
 */
export function PinToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="ucpnb-toggle-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <strong>Pin to the top</strong>
        <span>Shown above every other notice. Without a deadline it stays up until you unpin it.</span>
      </span>
    </label>
  );
}

/** The publisher's "last call" switch in the notice forms, shown once a deadline is set. */
export function LastCallToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="ucpnb-toggle-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <strong>Last-call reminder</strong>
        <span>Notify students again about 30 minutes before the deadline.</span>
      </span>
    </label>
  );
}

/** Whoever posted a notice: their logo if they've set one, otherwise their initials. */
export function Avatar({ name, size = "sm", imageUrl }: { name: string; size?: "sm" | "md"; imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      <img
        className={`ucpnb-avatar ucpnb-avatar-${size} ucpnb-avatar-image`}
        src={optimizeImageUrl(imageUrl, size === "md" ? 96 : 48) ?? undefined}
        alt=""
        loading="lazy"
      />
    );
  }
  return (
    <span className={`ucpnb-avatar ucpnb-avatar-${size} ucpnb-tone-${categoryTone(name)}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
