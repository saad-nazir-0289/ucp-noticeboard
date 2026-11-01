// Horizon's look, from the toolbar menu (popup/popup.js): Style
// (NoticeBoard or Original) and Theme (Light, Dark or Auto). Runs on every
// Horizon page before it draws.
//
// NoticeBoard style is skin.css on html.ucpnb-skin, light or dark
// (html.ucpnb-dark). Original style in dark recolours Horizon's own look:
//
// Horizon has no dark mode of its own, so this recolours the page as it
// is: every light background becomes a dark one and every dark text a
// light one, keeping each colour's hue (a green note stays green, a blue
// link stays blue, just lighter). Colours that are already dark (the navy
// bars, coloured badges), pictures and charts are left alone. The
// NoticeBoard panel isn't touched here: on html.ucpnb-dark it uses its
// own dark colours (shared/styles/tokens.css).
(() => {
  const KEY = "ucpnb_theme"; // "dark" (the default), "light" or "system"
  const STYLE_KEY = "ucpnb_style"; // "noticeboard" (the default) or "original"
  // A copy in the page's own storage, read synchronously, so the right look
  // is on before Horizon draws instead of after the extension's storage
  // answers (no flash of the original page).
  const CACHE_KEY = "ucpnb_look";
  // The student's own picture (toolbar menu): an uploaded photo (data URL)
  // or an image link, shown instead of Horizon's in the top bar, sidebar
  // and dashboard. Only in this Chrome; Horizon itself is never changed.
  const AVATAR_KEY = "ucpnb_avatar";
  const PANEL = "#ucp-noticeboard-root";
  const SKIP = new Set(["IMG", "PICTURE", "VIDEO", "CANVAS", "SVG", "IFRAME", "SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT", "BR"]);
  const html = document.documentElement;
  const deviceDark = window.matchMedia("(prefers-color-scheme: dark)");
  let preference = "dark";
  let style = "noticeboard";
  let active = false; // the recolouring below
  // "original": Original style in dark, every light colour turned dark.
  // "skin": NoticeBoard style in dark, a safety net for what skin.css
  // doesn't cover (pages it hasn't seen): only near-white backgrounds and
  // text too dark to read are changed; skin.css's own colours are already
  // dark and stay as they are.
  let mode = "original";
  // Every property set on each element, so switching back can undo it.
  const changed = new Map();

  // ---------- Colour maths ----------
  function parse(value) {
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  }
  function toHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s, l };
  }
  const hsl = (h, s, l, a) => `hsla(${h.toFixed(0)}, ${(s * 100).toFixed(0)}%, ${(l * 100).toFixed(0)}%, ${a})`;

  // A light background (white, pale grey, pale tint) becomes a dark one:
  // white → the page's deep navy-grey, paler tints a little lighter.
  function darkBackground(c) {
    const { h, s, l } = toHsl(c);
    if (l < 0.6) return null; // already dark: navy bars, coloured badges
    const darkL = 0.1 + (1 - l) * 0.35;
    return hsl(s < 0.15 ? 218 : h, s < 0.15 ? 0.28 : Math.min(s, 0.45), darkL, c.a);
  }
  // Dark text becomes light: black → soft white, coloured text keeps its
  // hue and gets lighter so it reads on the dark background.
  function lightText(c) {
    const { h, s, l } = toHsl(c);
    if (l > 0.62) return null; // already light: white text on navy
    const lightL = s < 0.15 ? 0.9 - l * 0.4 : Math.max(0.68, 0.84 - l * 0.2);
    return hsl(s < 0.15 ? 215 : h, s < 0.15 ? 0.2 : Math.min(1, s), lightL, c.a);
  }
  function darkBorder(c) {
    const { l } = toHsl(c);
    return l > 0.6 ? hsl(218, 0.22, 0.24, c.a) : null;
  }

  // ---------- Recolouring ----------
  function set(el, prop, value) {
    if (!value) return;
    let props = changed.get(el);
    if (!props) changed.set(el, (props = new Map()));
    if (!props.has(prop)) props.set(prop, [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    el.style.setProperty(prop, value, "important");
  }

  // The NoticeBoard dark surface, for a leftover white box.
  function skinBackground(c) {
    return toHsl(c).l > 0.86 ? hsl(218, 0.32, 0.16, c.a) : null;
  }

  function recolour(el) {
    if (SKIP.has(el.tagName.toUpperCase()) || el.closest(PANEL) || el.closest("svg")) return;
    const style = getComputedStyle(el);
    const bg = parse(style.backgroundColor);
    if (bg && bg.a > 0) set(el, "background-color", mode === "skin" ? skinBackground(bg) : darkBackground(bg));
    const fg = parse(style.color);
    if (fg) set(el, "color", lightText(fg));
    for (const side of ["top", "right", "bottom", "left"]) {
      if (style[`border-${side}-style`] === "none") continue;
      const border = parse(style[`border-${side}-color`]);
      if (border && border.a > 0) set(el, `border-${side}-color`, darkBorder(border));
    }
  }

  function recolourAll(root) {
    if (root.nodeType !== 1) return;
    recolour(root);
    for (const el of root.querySelectorAll("*")) recolour(el);
  }

  // Content Horizon adds later (menus, tabs, loaded sections).
  let pending = [];
  let scheduled = false;
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) for (const node of m.addedNodes) if (node.nodeType === 1) pending.push(node);
    if (scheduled || pending.length === 0) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const nodes = pending;
      pending = [];
      if (active) nodes.forEach(recolourAll);
    });
  });

  function turnOn(newMode) {
    if (active && mode === newMode) return;
    if (active) turnOff();
    mode = newMode;
    active = true;
    const start = () => {
      recolourAll(document.body);
      html.classList.remove("ucpnb-dark-pending");
      observer.observe(document.body, { childList: true, subtree: true });
    };
    if (document.body && document.readyState !== "loading") start();
    else {
      // Hidden until recoloured, so the light page never flashes.
      html.classList.add("ucpnb-dark-pending");
      setTimeout(() => html.classList.remove("ucpnb-dark-pending"), 1500);
      document.addEventListener("DOMContentLoaded", start, { once: true });
    }
  }

  function turnOff() {
    if (!active) return;
    active = false;
    observer.disconnect();
    html.classList.remove("ucpnb-dark-pending");
    for (const [el, props] of changed) {
      for (const [prop, [value, priority]] of props) {
        if (value) el.style.setProperty(prop, value, priority);
        else el.style.removeProperty(prop);
      }
    }
    changed.clear();
  }

  // Horizon's own scripts rewrite <html class="..."> after loading (feature
  // and web-font detection), which would drop these and put the original
  // look back: put them back whenever that happens.
  let wanted = { skin: false, dark: false };
  function keepClasses() {
    if (html.classList.contains("ucpnb-skin") !== wanted.skin) html.classList.toggle("ucpnb-skin", wanted.skin);
    if (html.classList.contains("ucpnb-dark") !== wanted.dark) html.classList.toggle("ucpnb-dark", wanted.dark); // also the panel's dark colours
    if (html.classList.contains("ucpnb-avatar-pending") !== hideAvatar) html.classList.toggle("ucpnb-avatar-pending", hideAvatar);
  }
  new MutationObserver(keepClasses).observe(html, { attributes: true, attributeFilter: ["class"] });

  const apply = () => {
    const dark = preference === "dark" || (preference === "system" && deviceDark.matches);
    const skin = style !== "original";
    wanted = { skin, dark };
    keepClasses();
    dark ? turnOn(skin ? "skin" : "original") : turnOff();
    if (document.body) tuneSchedule();
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ preference, style }));
    } catch {
      // Not remembered for the next page: it waits for the extension's storage.
    }
  };

  // ---------- Own picture ----------
  // Horizon's own picture stays hidden until it's been swapped, so it never
  // shows for a moment while the page loads. The picture is also kept in the
  // page's own storage, so it's ready before the extension's storage answers.
  const AVATAR_CACHE = "ucpnb_avatar_cache";
  let avatar = null;
  try {
    avatar = localStorage.getItem(AVATAR_CACHE);
  } catch {
    // Waits for the extension's storage instead.
  }
  let hideAvatar = Boolean(avatar);
  keepClasses();
  const AVATAR_IMG = ".user_heading_avatar img";
  function applyAvatar(root = document) {
    const imgs = root.matches?.(AVATAR_IMG) ? [root] : root.querySelectorAll(AVATAR_IMG);
    for (const img of imgs) {
      if (img.closest(PANEL)) continue;
      if (!("ucpnbOriginal" in img.dataset)) img.dataset.ucpnbOriginal = img.getAttribute("src") ?? "";
      const src = avatar || img.dataset.ucpnbOriginal;
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
      img.style.objectFit = avatar ? "cover" : "";
      img.dataset.ucpnbAvatar = "";
    }
  }
  function setAvatar(src) {
    avatar = src || null;
    try {
      if (avatar) localStorage.setItem(AVATAR_CACHE, avatar);
      else localStorage.removeItem(AVATAR_CACHE);
    } catch {
      // Too big for the page's storage: it then waits for the extension's.
    }
    applyAvatar();
    hideAvatar = false;
    keepClasses();
  }

  // ---------- Horizon's logo ----------
  // On most pages Horizon swaps its logo for a sharper "@2x" copy that isn't
  // there, leaving a broken picture: put the normal one back.
  function fixLogo(img) {
    if (img.tagName !== "IMG" || img.dataset.ucpnbLogo || !/@2x\./.test(img.getAttribute("src") ?? "")) return;
    img.dataset.ucpnbLogo = "1";
    img.setAttribute("src", img.getAttribute("src").replace("@2x.", "."));
  }
  document.addEventListener("error", (e) => fixLogo(e.target), true);
  const checkLogos = () => {
    for (const img of document.querySelectorAll('#header_main img[src*="@2x."]')) {
      if (img.complete && img.naturalWidth === 0) fixLogo(img);
    }
  };

  // ---------- Time table ----------
  // Each course gets its own colour, today's column is marked, and the tiny
  // fixed sizes Horizon writes on each class are cleared (they're set
  // "important" on the element itself, which no stylesheet can override).
  const PARTS = ["ucpnb-teacher", "ucpnb-course", "ucpnb-section", "ucpnb-room"];
  function twelveHour(text) {
    const m = text.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hour = Number(m[1]);
    return `${hour % 12 || 12}:${m[2]} ${hour < 12 ? "AM" : "PM"}`;
  }
  const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  function tuneSchedule() {
    const events = document.querySelectorAll(".cd-schedule__event");
    if (events.length === 0) return;
    if (!wanted.skin) {
      for (const el of document.querySelectorAll("[data-ucpnb-style]")) {
        el.setAttribute("style", el.dataset.ucpnbStyle);
        delete el.dataset.ucpnbStyle;
      }
      for (const el of document.querySelectorAll("[data-ucpnb-text]")) {
        el.textContent = el.dataset.ucpnbText;
        delete el.dataset.ucpnbText;
      }
      return;
    }
    // 12-hour times: the hours down the side and each class's own time.
    for (const label of document.querySelectorAll(".cd-schedule__timeline li > span")) {
      if ("ucpnbText" in label.dataset) continue;
      const time = twelveHour(label.textContent);
      if (!time) continue;
      label.dataset.ucpnbText = label.textContent;
      label.textContent = time;
    }
    const tones = new Map();
    for (const event of events) {
      const names = [...event.querySelectorAll(".cd-schedule__name")];
      names.forEach((el, i) => {
        const text = el.textContent.trim();
        // Some classes repeat the room on a fifth line.
        const repeat = i >= PARTS.length && names.slice(0, i).some((n) => n.textContent.trim() === text);
        el.classList.add(!text || repeat ? "ucpnb-blank" : PARTS[i] ?? "ucpnb-extra");
        if (el.hasAttribute("style") && !("ucpnbStyle" in el.dataset)) {
          el.dataset.ucpnbStyle = el.getAttribute("style");
          el.style.removeProperty("font-size");
          el.style.removeProperty("margin");
        }
      });
      const link = event.querySelector("a");
      if (link && !link.querySelector(".ucpnb-time")) {
        const start = twelveHour(link.dataset.start ?? "");
        const end = twelveHour(link.dataset.end ?? "");
        if (start && end) {
          const time = document.createElement("span");
          time.className = "ucpnb-time";
          // "1:00–1:55 PM", or "11:30 AM–12:25 PM" across noon.
          const [startClock, startHalf] = start.split(" ");
          time.textContent = startHalf === end.split(" ")[1] ? `${startClock}–${end}` : `${start}–${end}`;
          link.append(time);
        }
      }
      const course = (names[1] ?? names[0])?.textContent.trim().toLowerCase() ?? "";
      if (!tones.has(course)) tones.set(course, (tones.size % 6) + 1);
      event.dataset.ucpnbTone = tones.get(course);
    }
    // Fit: a class whose text overflows its slot gets a tighter layout, then
    // one without the room (measured after layout, so a frame later).
    requestAnimationFrame(() => {
      const overflows = (event) => {
        const link = event.querySelector("a");
        return link && link.scrollHeight > link.clientHeight + 1;
      };
      for (const event of events) {
        event.classList.remove("ucpnb-tight", "ucpnb-tighter");
        if (!overflows(event)) continue;
        event.classList.add("ucpnb-tight");
        if (overflows(event)) event.classList.add("ucpnb-tighter");
      }
    });
    const today = DAYS[new Date().getDay()];
    for (const group of document.querySelectorAll(".cd-schedule__group")) {
      const day = group.querySelector(".cd-schedule__top-info")?.textContent.trim().toLowerCase();
      group.classList.toggle("ucpnb-today", day === today);
    }
  }

  // Everything Horizon adds while loading and later.
  let tuneQueued = false;
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "attributes") {
        if (m.target.closest?.(".user_heading_avatar")) applyAvatar(m.target);
        continue;
      }
      for (const node of m.addedNodes) if (node.nodeType === 1) applyAvatar(node);
    }
    if (!tuneQueued) {
      tuneQueued = true;
      requestAnimationFrame(() => {
        tuneQueued = false;
        tuneSchedule();
      });
    }
  }).observe(html, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  document.addEventListener("DOMContentLoaded", () => {
    applyAvatar();
    tuneSchedule();
    checkLogos();
  }, { once: true });
  window.addEventListener("load", checkLogos, { once: true });
  // Never hidden for long, whatever happens.
  setTimeout(() => {
    hideAvatar = false;
    keepClasses();
  }, 2000);
  chrome.storage.local.get(AVATAR_KEY).then((saved) => setAvatar(saved[AVATAR_KEY]));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && AVATAR_KEY in changes) setAvatar(changes[AVATAR_KEY].newValue);
  });

  // ---------- Introduction after installing or updating ----------
  // A card at the top right, under Chrome's toolbar, with an arrow up to
  // NoticeBoard's icon (marked "NEW" by background.js): what NoticeBoard
  // does, or what's changed. Shown until dismissed here or the menu opens.
  const TOUR_KEY = "ucpnb_tour";
  function showIntro(tour) {
    if (document.getElementById("ucpnb-intro") || !globalThis.UCPNB_WHATS_NEW) return;
    const install = tour.reason === "install";
    const items = install ? UCPNB_WHATS_NEW.install : UCPNB_WHATS_NEW.updates;
    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };
    const box = el("aside");
    box.id = "ucpnb-intro";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", install ? "Welcome to NoticeBoard" : "What's new in NoticeBoard");
    const arrow = el("div", "ucpnb-intro-arrow");
    arrow.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V5M5 11l7-7 7 7"/></svg>';
    const card = el("div", "ucpnb-intro-card");
    card.append(
      el("span", "ucpnb-intro-eyebrow", install ? "NoticeBoard is installed" : `NoticeBoard updated to v${tour.version}`),
      el("strong", "ucpnb-intro-title", install ? "Here's what you get" : "What's new")
    );
    const list = el("ul");
    items.forEach((item, i) => {
      const li = el("li");
      li.style.animationDelay = `${0.25 + i * 0.08}s`;
      const text = el("span");
      text.append(el("b", "", item.title), el("small", "", item.text));
      li.append(el("span", "ucpnb-intro-icon", item.icon), text);
      list.append(li);
    });
    const hint = el(
      "p",
      "ucpnb-intro-hint",
      "Open NoticeBoard from Chrome's toolbar, up here. Can't see it? Click the puzzle piece and pin UCP NoticeBoard."
    );
    const done = el("button", "", "Got it");
    done.type = "button";
    done.addEventListener("click", () => {
      chrome.storage.local.remove(TOUR_KEY);
      box.classList.add("ucpnb-intro-closing");
      setTimeout(() => box.remove(), 300);
    });
    card.append(list, hint, done);
    box.append(arrow, card);
    document.body.append(box);
  }
  const startIntro = () =>
    chrome.storage.local.get(TOUR_KEY).then((saved) => {
      if (saved[TOUR_KEY]) showIntro(saved[TOUR_KEY]);
    });
  if (document.body && document.readyState !== "loading") startIntro();
  else document.addEventListener("DOMContentLoaded", startIntro, { once: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && TOUR_KEY in changes && !changes[TOUR_KEY].newValue) document.getElementById("ucpnb-intro")?.remove();
  });

  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    if (cached) {
      preference = cached.preference ?? preference;
      style = cached.style ?? style;
      apply();
    }
  } catch {
    // Nothing usable cached.
  }
  chrome.storage.local.get([KEY, STYLE_KEY]).then((saved) => {
    preference = saved[KEY] ?? "dark";
    style = saved[STYLE_KEY] ?? "noticeboard";
    apply();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(KEY in changes || STYLE_KEY in changes)) return;
    if (KEY in changes) preference = changes[KEY].newValue ?? "dark";
    if (STYLE_KEY in changes) style = changes[STYLE_KEY].newValue ?? "noticeboard";
    apply();
  });
  deviceDark.addEventListener("change", apply);
})();
