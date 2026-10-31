// Applies the saved Theme to this menu before it draws (popup.js keeps it
// in sync afterwards). Same setting as Horizon and the panel.
chrome.storage.local.get("ucpnb_theme").then((saved) => {
  const preference = saved.ucpnb_theme ?? "light";
  const dark = preference === "dark" || (preference === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
});
