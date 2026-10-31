import { createRoot, type Root } from "react-dom/client";
import { NoticeBoard } from "./NoticeBoard";
import "@shared/styles/tokens.css";
import "@shared/styles/components.css";
import "./content.css";

const CONTAINER_ID = "ucp-noticeboard-root";
const SECTION_HEADING_TEXT = "Classes, Grades and Attendance";
// The toolbar menu's "Show on Horizon dashboard" switch (popup/popup.js).
// Anything but an explicit false means shown.
const ENABLED_KEY = "ucpnb_enabled";

// The toolbar menu's Theme: "light" (default), "dark" or "system". In dark
// mode the panel uses the shared dark colours (shared/styles/tokens.css);
// horizon-theme/ darkens the rest of the page.
const THEME_KEY = "ucpnb_theme";
const deviceDark = window.matchMedia("(prefers-color-scheme: dark)");
let themePreference = "light";

function applyTheme() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return;
  const dark = themePreference === "dark" || (themePreference === "system" && deviceDark.matches);
  if (dark) container.dataset.ucpnbTheme = "dark";
  else delete container.dataset.ucpnbTheme;
}

let root: Root | null = null;

function findInjectionAnchor(): Element | null {
  const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5"));
  const heading = headings.find((el) =>
    el.textContent?.trim().toLowerCase().includes(SECTION_HEADING_TEXT.toLowerCase())
  );
  if (!heading) return null;

  const gridWrapper = heading.closest('[class*="uk-width"]');
  if (gridWrapper) return gridWrapper;

  return heading.parentElement ?? heading;
}

function inject() {
  if (document.getElementById(CONTAINER_ID)) return;

  const anchor = findInjectionAnchor();
  const container = document.createElement("div");
  container.id = CONTAINER_ID;

  if (anchor?.parentElement) {
    anchor.parentElement.insertBefore(container, anchor);
  } else {
    document.body.appendChild(container);
  }

  root = createRoot(container);
  root.render(<NoticeBoard />);
  applyTheme();
}

function remove() {
  root?.unmount();
  root = null;
  document.getElementById(CONTAINER_ID)?.remove();
}

// Outside Chrome (the local mock portal) there's no extension storage:
// always shown.
const storage = typeof chrome !== "undefined" ? chrome.storage?.local : undefined;

async function start() {
  let enabled = true;
  try {
    const saved = await storage?.get([ENABLED_KEY, THEME_KEY]);
    enabled = saved?.[ENABLED_KEY] !== false;
    themePreference = (saved?.[THEME_KEY] as string | undefined) ?? "light";
  } catch {
    // Can't read the settings: shown, light, as before there were any.
  }
  if (enabled) inject();
  deviceDark.addEventListener("change", applyTheme);

  // Flipping the switch takes effect on an open dashboard straight away.
  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    if (THEME_KEY in changes) {
      themePreference = (changes[THEME_KEY].newValue as string | undefined) ?? "light";
      applyTheme();
    }
    if (!(ENABLED_KEY in changes)) return;
    if (changes[ENABLED_KEY].newValue === false) remove();
    else inject();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
