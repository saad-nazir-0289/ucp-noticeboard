// The menu shown when NoticeBoard is clicked in Chrome's toolbar.
// popup-config.js (written at build time) sets window.UCPNB_PWA_URL.
const ENABLED_KEY = "ucpnb_enabled"; // read by the content script (src/content/index.tsx)
const STORE_URL = "https://chromewebstore.google.com/detail/dmkdgckajefikfbbfblihmnamjiaemfg";
const REPO_URL = "https://github.com/saad-nazir-0289/ucp-noticeboard";

const pwa = window.UCPNB_PWA_URL;
const destinations = {
  horizon: "https://horizon.ucp.edu.pk/student/dashboard",
  app: pwa,
  review: `${STORE_URL}/reviews`,
  github: REPO_URL,
  contact: `${STORE_URL}/support`,
  privacy: `${REPO_URL}/blob/main/Privacy.md`,
};

document.getElementById("version").textContent = `Version ${chrome.runtime.getManifest().version}`;

for (const button of document.querySelectorAll("[data-open]")) {
  button.addEventListener("click", () => {
    chrome.tabs.create({ url: destinations[button.dataset.open] });
    window.close();
  });
}

// The QR code: opens NoticeBoard on the phone that scans it, asking to
// turn on notifications (qr-notifications.svg, drawn at build time).
const qrToggle = document.getElementById("qr-toggle");
const qr = document.getElementById("qr");
qrToggle.addEventListener("click", () => {
  qr.hidden = !qr.hidden;
  qrToggle.setAttribute("aria-expanded", String(!qr.hidden));
});

const toggle = document.getElementById("enabled");
const note = document.getElementById("switch-note");
const showNote = (on) => {
  note.textContent = on ? "Campus notices appear on your dashboard." : "Hidden. Turn on to bring it back.";
};
chrome.storage.local.get(ENABLED_KEY).then((saved) => {
  toggle.checked = saved[ENABLED_KEY] !== false;
  showNote(toggle.checked);
});
toggle.addEventListener("change", () => {
  chrome.storage.local.set({ [ENABLED_KEY]: toggle.checked });
  showNote(toggle.checked);
});
