/**
 * Keeps the phone layout when Chrome's "Desktop site" is switched on.
 *
 * In desktop mode Chrome ignores the page's viewport tag and lays the page
 * out 980px wide, so a phone shows the shrunken computer layout — and an
 * installed NoticeBoard inherits that setting. No page can switch the mode
 * off, but it can notice it: a touch screen whose page is far wider than
 * the screen itself. Then the page is zoomed back to the screen's real
 * width, and `ucpnb-phone-zoom` on <html> tells the stylesheets to use the
 * phone rules (their width media queries would still see 980px). Heights
 * based on the screen go through --nb-vh / --nb-vw, which stay correct
 * under the zoom.
 */
export function keepPhoneLayout(): void {
  const root = document.documentElement;

  const apply = () => {
    const forcedWide = navigator.maxTouchPoints > 0 && screen.width < 900 && window.innerWidth > screen.width * 1.25;
    if (!forcedWide) {
      root.classList.remove("ucpnb-phone-zoom");
      root.style.removeProperty("zoom");
      root.style.removeProperty("--nb-vh");
      root.style.removeProperty("--nb-vw");
      return;
    }
    const zoom = window.innerWidth / screen.width;
    root.classList.add("ucpnb-phone-zoom");
    root.style.setProperty("zoom", String(zoom));
    root.style.setProperty("--nb-vh", `${window.innerHeight / zoom / 100}px`);
    root.style.setProperty("--nb-vw", `${window.innerWidth / zoom / 100}px`);
  };

  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
}

/** Whether the phone layout is in use (a narrow screen, or the desktop-mode correction above). */
export function isPhoneLayout(): boolean {
  return document.documentElement.classList.contains("ucpnb-phone-zoom") || window.matchMedia("(max-width: 640px)").matches;
}
