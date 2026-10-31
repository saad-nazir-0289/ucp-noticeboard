// The menu shown when NoticeBoard is clicked in Chrome's toolbar.
// popup-config.js (written at build time) sets window.UCPNB_PWA_URL.
const ENABLED_KEY = "ucpnb_enabled"; // read by the content script (src/content/index.tsx)
const STYLE_KEY = "ucpnb_style"; // "noticeboard" (default) or "original": Horizon's look (horizon-theme/)
const THEME_KEY = "ucpnb_theme"; // "dark" (default), "light" or "system": Horizon and the panel (this menu is always dark)
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
let theme = "dark";
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
  theme = saved[THEME_KEY] ?? "dark";
  showTheme();
  style = saved[STYLE_KEY] ?? "noticeboard";
  showStyle();
});

// ---------- Own picture on Horizon (horizon-theme/theme.js shows it) ----------
const AVATAR_KEY = "ucpnb_avatar";
const avatarPreview = document.getElementById("avatar-preview");
const avatarNote = document.getElementById("avatar-note");
const avatarReset = document.getElementById("avatar-reset");
const avatarFile = document.getElementById("avatar-file");
const avatarForm = document.getElementById("avatar-link-form");
const avatarLink = document.getElementById("avatar-link");
const DEFAULT_NOTE = "Only in this Chrome. Horizon isn't changed.";

const showAvatar = (src) => {
  avatarPreview.style.backgroundImage = src ? `url("${src.replace(/"/g, "%22")}")` : "";
  avatarReset.hidden = !src;
};
const sayAvatar = (text, error = false) => {
  avatarNote.textContent = text;
  avatarNote.classList.toggle("error", error);
};
const saveAvatar = (src) => {
  chrome.storage.local.set({ [AVATAR_KEY]: src });
  showAvatar(src);
  sayAvatar("Done. Reload Horizon if it's open.");
};

chrome.storage.local.get(AVATAR_KEY).then((saved) => showAvatar(saved[AVATAR_KEY] ?? null));

// A photo from this computer: cropped square and made small, so it's
// stored here and loads instantly (never uploaded anywhere).
document.getElementById("avatar-upload").addEventListener("click", () => avatarFile.click());
avatarFile.addEventListener("change", () => {
  const file = avatarFile.files?.[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const size = 256;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    canvas.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    URL.revokeObjectURL(img.src);
    saveAvatar(canvas.toDataURL("image/jpeg", 0.88));
  };
  img.onerror = () => sayAvatar("That file isn't a picture Chrome can open.", true);
  img.src = URL.createObjectURL(file);
});

// A link to a picture (it must be the image itself, not a page). The link
// box takes the buttons' place, so the menu stays the same height.
const avatarActions = document.querySelector(".avatar-actions");
const showLinkBox = (open) => {
  avatarForm.hidden = !open;
  avatarActions.hidden = open;
  if (open) avatarLink.focus();
  else avatarLink.value = "";
};
document.getElementById("avatar-link-toggle").addEventListener("click", () => showLinkBox(true));
document.getElementById("avatar-link-cancel").addEventListener("click", () => {
  showLinkBox(false);
  sayAvatar(DEFAULT_NOTE);
});
avatarForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = avatarLink.value.trim();
  sayAvatar("Checking the link…");
  const test = new Image();
  test.onload = () => {
    saveAvatar(url);
    showLinkBox(false);
  };
  test.onerror = () =>
    sayAvatar("That link isn't a picture. On Instagram, open the photo, right-click it and choose Copy image address.", true);
  test.src = url;
});

avatarReset.addEventListener("click", () => {
  chrome.storage.local.remove(AVATAR_KEY);
  showAvatar(null);
  sayAvatar(DEFAULT_NOTE);
});

// ---------- Introduction after installing or updating ----------
// background.js marks a new install or update (ucpnb_tour) and puts "NEW" on
// the toolbar icon; the first time the menu opens after that, it shows what
// NoticeBoard does (install) or what changed (update), then clears both.
const TOUR_KEY = "ucpnb_tour";
chrome.storage.local.get(TOUR_KEY).then((saved) => {
  const tour = saved[TOUR_KEY];
  if (!tour) return;
  const intro = document.getElementById("intro");
  const install = tour.reason === "install";
  document.getElementById("intro-eyebrow").textContent = install ? "Welcome" : `Updated to v${chrome.runtime.getManifest().version}`;
  document.getElementById("intro-title").textContent = install ? "Here's what NoticeBoard does" : "What's new";
  const list = document.getElementById("intro-list");
  (install ? UCPNB_WHATS_NEW.install : UCPNB_WHATS_NEW.updates).forEach((item, i) => {
    const li = document.createElement("li");
    li.style.animationDelay = `${0.15 + i * 0.09}s`;
    const icon = document.createElement("span");
    icon.className = "intro-icon";
    icon.textContent = item.icon;
    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = item.title;
    const detail = document.createElement("small");
    detail.textContent = item.text;
    text.append(title, detail);
    li.append(icon, text);
    list.append(li);
  });
  intro.hidden = false;
  const done = () => {
    intro.classList.add("closing");
    setTimeout(() => (intro.hidden = true), 250);
  };
  document.getElementById("intro-done").addEventListener("click", done);
  // Seen: the toolbar badge and Horizon's introduction go away.
  chrome.storage.local.remove(TOUR_KEY);
  chrome.action.setBadgeText({ text: "" });
});
