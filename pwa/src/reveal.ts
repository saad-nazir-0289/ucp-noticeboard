import { useEffect, type RefObject } from "react";

// Notices ease into view as they scroll up from the bottom of the screen
// (a short fade and rise) instead of simply appearing at the edge. Each
// one animates once; those arriving together follow one another slightly.
// Nothing moves for anyone who has asked their phone for reduced motion.
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Reveals the direct children of `container` as they come into view; `deps` re-scans for new ones. */
export function useReveal(container: RefObject<HTMLElement>, deps: unknown[]): void {
  useEffect(() => {
    const root = container.current;
    if (!root || reducedMotion() || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry, i) => {
            const el = entry.target as HTMLElement;
            el.style.transitionDelay = `${Math.min(i * 45, 225)}ms`;
            el.classList.add("is-in");
            observer.unobserve(el);
          });
      },
      { rootMargin: "0px 0px -20px 0px", threshold: 0.08 }
    );

    for (const child of Array.from(root.children) as HTMLElement[]) {
      if (child.classList.contains("is-in")) continue;
      child.classList.add("ucpnb-reveal");
      observer.observe(child);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
