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

// Dark mode needs nothing here: horizon-theme/theme.js marks the page
// (html.ucpnb-dark) and the panel's dark colours key on that
// (shared/styles/tokens.css).

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
    enabled = (await storage?.get(ENABLED_KEY))?.[ENABLED_KEY] !== false;
  } catch {
    // Can't read the switch: show it, as before there was one.
  }
  if (enabled) inject();

  // Flipping the switch takes effect on an open dashboard straight away.
  chrome?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local" || !(ENABLED_KEY in changes)) return;
    if (changes[ENABLED_KEY].newValue === false) remove();
    else inject();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
