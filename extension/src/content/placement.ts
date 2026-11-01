// Where the NoticeBoard panel sits on the Horizon dashboard, chosen by the
// student ("Move NoticeBoard" in the panel's menu) and remembered in
// chrome.storage.local.
//
// The dashboard is one card of sections, each starting with a heading
// (h3.heading_a: "Academics", "Classes, Grades and Attendance", "News and
// Announcements"), plus "Submissions Due" from horizon-due.js. A place is
// "above <section heading>" or "at the bottom"; no saved place means the
// default, at the top.

const KEY = "ucpnb_panel_place";
type Place = { before: string } | { end: true };

const storage = typeof chrome !== "undefined" ? chrome.storage?.local : undefined;

const norm = (text: string | null | undefined) =>
  (text ?? "").replace(/\d+/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** The dashboard card's sections, in page order, each with its first node. */
function sections(): { title: string; key: string; node: Element; parent: Element }[] {
  const found: { title: string; key: string; node: Element; parent: Element }[] = [];
  const seen = new Set<string>();
  for (const el of document.querySelectorAll("#page_content_inner .md-card-content > h3.heading_a, #ucpnb-due")) {
    if (!el.parentElement || el.closest("#ucp-noticeboard-root")) continue;
    const title =
      el.id === "ucpnb-due"
        ? "Submissions Due"
        : (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const key = norm(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    found.push({ title, key, node: el, parent: el.parentElement });
  }
  return found;
}

/** Puts the panel at a saved place; false when that place isn't on the page (yet). */
function put(container: Element, place: Place): boolean {
  const list = sections();
  if ("end" in place) {
    const last = list[list.length - 1];
    if (!last) return false;
    last.parent.append(container);
    return true;
  }
  const target = list.find((s) => s.key === place.before);
  if (!target) return false;
  target.parent.insertBefore(container, target.node);
  return true;
}

/**
 * Moves a freshly added panel to the student's saved place. A section that
 * comes later (Submissions Due is read in the background) is waited for a
 * little while.
 */
export async function applySavedPlace(container: Element) {
  let place: Place | undefined;
  try {
    place = (await storage?.get(KEY))?.[KEY];
  } catch {
    return;
  }
  if (!place || put(container, place)) return;
  const area = document.getElementById("page_content_inner") ?? document.body;
  const observer = new MutationObserver(() => {
    if (container.isConnected && put(container, place!)) observer.disconnect();
  });
  observer.observe(area, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 15000);
}

// ---------- Choosing a place ----------
let picking: (() => void) | null = null;

/**
 * Shows a "Place NoticeBoard here" slot at every possible place; the
 * student clicks one (or Cancel / Esc). `restoreDefault` puts the panel
 * back where it is added by default.
 */
export function pickPlace(container: Element, restoreDefault: () => void) {
  picking?.();
  const added: Element[] = [];
  const html = document.documentElement;
  html.classList.add("ucpnb-placing");

  const slot = (label: string, onPick: () => void) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ucpnb-place-slot";
    const strong = document.createElement("strong");
    strong.textContent = "Place NoticeBoard here";
    const span = document.createElement("span");
    span.textContent = label;
    button.append(strong, span);
    button.addEventListener("click", () => {
      onPick();
      done();
      container.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    added.push(button);
    return button;
  };
  const save = (place: Place | null) => {
    if (place) storage?.set({ [KEY]: place }).catch(() => {});
    else storage?.remove(KEY).catch(() => {});
  };

  const list = sections();
  // The default spot, at the top of the dashboard card.
  if (list[0]) {
    const top = slot("At the top (default)", () => {
      save(null);
      restoreDefault();
    });
    // Just above the panel when it's there now.
    if (container.parentElement && !list.some((s) => s.parent === container.parentElement)) container.before(top);
    else list[0].parent.before(top);
  }
  // The first section's spot is the default one, just above it.
  for (const s of list.slice(1)) {
    s.parent.insertBefore(
      slot(`Above ${s.title}`, () => {
        save({ before: s.key });
        put(container, { before: s.key });
      }),
      s.node
    );
  }
  const last = list[list.length - 1];
  if (last) {
    last.parent.append(
      slot("At the bottom", () => {
        save({ end: true });
        put(container, { end: true });
      })
    );
  }

  const bar = document.createElement("div");
  bar.className = "ucpnb-place-bar";
  bar.setAttribute("role", "status");
  const text = document.createElement("span");
  text.textContent = "Choose where NoticeBoard goes on your dashboard.";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => done());
  bar.append(text, cancel);
  document.body.append(bar);
  added.push(bar);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") done();
  };
  document.addEventListener("keydown", onKey);

  function done() {
    for (const el of added) el.remove();
    html.classList.remove("ucpnb-placing");
    document.removeEventListener("keydown", onKey);
    picking = null;
  }
  picking = done;
  (added[0] as HTMLElement | undefined)?.scrollIntoView({ behavior: "smooth", block: "center" });
}
