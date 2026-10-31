// The menu shown when NoticeBoard is clicked in Chrome's toolbar.
// popup-config.js (written at build time) sets window.UCPNB_PWA_URL.
const ENABLED_KEY = "ucpnb_enabled"; // read by the content script (src/content/index.tsx)
const STYLE_KEY = "ucpnb_style"; // "noticeboard" (default) or "original": Horizon's look (horizon-theme/)
const THEME_KEY = "ucpnb_theme"; // "light", "dark" or "system": Horizon and the panel (this menu is always dark)
const STORE_URL = "https://chromewebstore.google.com/detail/dmkdgckajefikfbbfblihmnamjiaemfg";
const REPO_URL = "https://github.com/saad-nazir-0289/ucp-noticeboard";
const WHATSAPP = "923254278463";

const destinations = {
  horizon: "https://horizon.ucp.edu.pk/student/dashboard",
  app: window.UCPNB_PWA_URL,
  review: `${STORE_URL}/reviews`,
  github: REPO_URL,
  whatsapp: `https://wa.me/${WHATSAPP}?text=${encodeURIComponent("Hi! About UCP NoticeBoard: ")}`,
  privacy: `${REPO_URL}/blob/main/Privacy.md`,
};

document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;

for (const button of document.querySelectorAll("[data-open]")) {
  button.addEventListener("click", () => {
    chrome.tabs.create({ url: destinations[button.dataset.open] });
    window.close();
  });
}

// Show on Horizon dashboard.
const toggle = document.getElementById("enabled");
const note = document.getElementById("switch-note");
const showNote = (on) => {
  note.textContent = on ? "Campus notices appear on your dashboard." : "Hidden. Turn on to bring it back.";
};
toggle.addEventListener("change", () => {
  chrome.storage.local.set({ [ENABLED_KEY]: toggle.checked });
  showNote(toggle.checked);
});

// Theme.
const choices = document.querySelectorAll("[data-theme-choice]");
let theme = "light";
const showTheme = () => {
  for (const choice of choices) choice.setAttribute("aria-checked", String(choice.dataset.themeChoice === theme));
};
for (const choice of choices) {
  choice.addEventListener("click", () => {
    theme = choice.dataset.themeChoice;
    chrome.storage.local.set({ [THEME_KEY]: theme });
    showTheme();
  });
}

// Horizon style.
const styleChoices = document.querySelectorAll("[data-style-choice]");
let style = "noticeboard";
const showStyle = () => {
  for (const choice of styleChoices) choice.setAttribute("aria-checked", String(choice.dataset.styleChoice === style));
};
for (const choice of styleChoices) {
  choice.addEventListener("click", () => {
    style = choice.dataset.styleChoice;
    chrome.storage.local.set({ [STYLE_KEY]: style });
    showStyle();
  });
}

chrome.storage.local.get([ENABLED_KEY, THEME_KEY, STYLE_KEY]).then((saved) => {
  toggle.checked = saved[ENABLED_KEY] !== false;
  showNote(toggle.checked);
  theme = saved[THEME_KEY] ?? "light";
  showTheme();
  style = saved[STYLE_KEY] ?? "noticeboard";
  showStyle();
});
