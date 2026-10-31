// Dark mode for Horizon itself, chosen under Theme in the toolbar menu
// (popup/popup.js). Runs on every Horizon page before it draws, so there's
// no white flash. Horizon has no dark mode of its own: theme.css inverts
// the page and turns pictures and the NoticeBoard panel back, and the
// panel then uses its own dark colours (src/content/index.tsx).
(() => {
  const KEY = "ucpnb_theme"; // "light" (the default), "dark" or "system"
  const deviceDark = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = "light";

  const apply = () => {
    const dark = preference === "dark" || (preference === "system" && deviceDark.matches);
    document.documentElement.classList.toggle("ucpnb-dark", dark);
  };

  chrome.storage.local.get(KEY).then((saved) => {
    preference = saved[KEY] ?? "light";
    apply();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(KEY in changes)) return;
    preference = changes[KEY].newValue ?? "light";
    apply();
  });
  deviceDark.addEventListener("change", apply);
})();
