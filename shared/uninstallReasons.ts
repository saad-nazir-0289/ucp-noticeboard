/**
 * The answers the page after uninstalling offers (pwa/src/Goodbye.tsx), as
 * stored by the API (UninstallFeedback.Reasons), with how the Admin's
 * Analytics names them.
 */
export const UNINSTALL_REASONS: { id: string; label: string }[] = [
  { id: "not-useful", label: "I didn't find it useful" },
  { id: "slow", label: "It was slow" },
  { id: "errors", label: "It showed errors or didn't load" },
  { id: "phone-app", label: "I use the phone app instead" },
  { id: "cluttered", label: "It cluttered my Horizon dashboard" },
  { id: "other", label: "Something else" },
];

export const uninstallReasonLabel = (id: string) => UNINSTALL_REASONS.find((r) => r.id === id)?.label ?? id;
