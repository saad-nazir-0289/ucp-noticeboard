// Stay logged in: when Horizon's "Your session is about to expire!" box
// opens (#modal_idle), its "Stay Online" button (#staySigned) is pressed for
// the student, as if they'd clicked it. On by default; a switch in the
// toolbar menu (ucpnb_stay_signed_in) turns it off, for shared computers.
(() => {
  const KEY = "ucpnb_stay_signed_in";
  let on = true;
  let pressing = false;

  const isOpen = (modal) =>
    modal &&
    (modal.classList.contains("uk-open") || modal.getAttribute("aria-hidden") === "false") &&
    getComputedStyle(modal).display !== "none";

  function check() {
    if (!on || pressing) return;
    const modal = document.getElementById("modal_idle");
    const stay = document.getElementById("staySigned");
    if (!isOpen(modal) || !stay) return;
    pressing = true;
    // A moment after it opens, so Horizon has finished showing it.
    setTimeout(() => {
      if (on && isOpen(modal)) stay.click();
      pressing = false;
      // Closing it that quickly can leave the page's scroll lock behind.
      setTimeout(unlockScroll, 700);
      setTimeout(unlockScroll, 2000);
    }, 400);
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
  // In case Horizon builds the box later, or replaces it.
  setInterval(() => {
    watch();
    check();
    unlockScroll();
  }, 5000);

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
