// Stay logged in. On by default; a switch in the toolbar menu
// (ucpnb_stay_signed_in) turns it off, for shared computers.
//
// Horizon signs the student out after a few minutes without mouse or
// keyboard activity, on every page: "Your session is about to expire!"
// (#modal_idle) counts down 30 seconds, then the session is closed and
// the Microsoft sign-in comes back. One tab timing out closes the session
// for every Horizon tab.
//
// Pressing "Stay Online" when that box opens isn't enough on its own: in
// a tab in the background, or a phone browser that was switched away
// from, the browser runs a page's timers late (up to a minute) or not at
// all, so the 30 seconds can run out before the press happens. So:
// - Horizon's idle timer is kept from running out: a little harmless
//   activity (a mouse move, a Shift key press and release, a scroll
//   event; nothing is clicked, typed or moved) is reported to the page
//   every 45 seconds, and straight away when the tab comes back into
//   view.
// - If the box opens anyway, "Stay Online" is pressed straight away.
(() => {
  const KEY = "ucpnb_stay_signed_in";
  const EVERY_MS = 45 * 1000;
  let on = true;

  const isOpen = (modal) =>
    modal &&
    (modal.classList.contains("uk-open") || modal.getAttribute("aria-hidden") === "false") &&
    getComputedStyle(modal).display !== "none";

  // The kind of events idle timers reset on. Made-up ones: no real mouse
  // or key is involved, and nothing on the page reacts to them otherwise.
  function nudge() {
    if (!on) return;
    try {
      const x = Math.round(innerWidth / 2);
      const y = Math.round(innerHeight / 2);
      document.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x, clientY: y }));
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Shift", code: "ShiftLeft" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Shift", code: "ShiftLeft" }));
      window.dispatchEvent(new Event("scroll"));
    } catch {
      // Too early: the next one will do.
    }
  }

  function check() {
    if (!on) return;
    const modal = document.getElementById("modal_idle");
    const stay = document.getElementById("staySigned");
    if (!isOpen(modal) || !stay) return;
    stay.click();
    nudge();
    // Closing it that quickly can leave the page's scroll lock behind.
    setTimeout(unlockScroll, 700);
    setTimeout(unlockScroll, 2000);
  }

  // UIkit locks the page's scrolling while a dialog is open (uk-modal-page
  // on <html>). If a dialog closed without undoing that, the page could no
  // longer scroll: with no dialog open, it's undone here.
  function unlockScroll() {
    const root = document.documentElement;
    if (!root.classList.contains("uk-modal-page")) return;
    const anyOpen = [...document.querySelectorAll(".uk-modal")].some(
      (m) => m.classList.contains("uk-open") && getComputedStyle(m).display !== "none"
    );
    if (anyOpen) return;
    root.classList.remove("uk-modal-page");
    for (const el of [root, document.body]) {
      el.style.removeProperty("overflow");
      el.style.removeProperty("padding-right");
    }
  }

  let watched = null;
  const observer = new MutationObserver(check);
  function watch() {
    const modal = document.getElementById("modal_idle");
    if (!modal || modal === watched) return;
    watched = modal;
    observer.observe(modal, { attributes: true, attributeFilter: ["class", "style", "aria-hidden"] });
    check();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch, { once: true });
  else watch();
  window.addEventListener("load", watch, { once: true });

  setInterval(() => {
    watch();
    check();
    nudge();
    unlockScroll();
  }, EVERY_MS);
  // Back from another tab or app, or a page restored by Back: before
  // Horizon's late timers decide the student has gone.
  const back = () => {
    nudge();
    check();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") back();
  });
  document.addEventListener("resume", back);
  window.addEventListener("focus", back);
  window.addEventListener("pageshow", back);

  chrome.storage.local.get(KEY).then((saved) => {
    on = saved[KEY] !== false;
    check();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(KEY in changes)) return;
    on = changes[KEY].newValue !== false;
    check();
  });
})();
