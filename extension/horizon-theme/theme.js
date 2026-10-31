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
  const KEY = "ucpnb_theme"; // "light" (the default), "dark" or "system"
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
  let preference = "light";
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
  }
  new MutationObserver(keepClasses).observe(html, { attributes: true, attributeFilter: ["class"] });

  const apply = () => {
    const dark = preference === "dark" || (preference === "system" && deviceDark.matches);
    const skin = style !== "original";
    wanted = { skin, dark };
    keepClasses();
    dark ? turnOn(skin ? "skin" : "original") : turnOff();
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ preference, style }));
    } catch {
      // Not remembered for the next page: it waits for the extension's storage.
    }
  };

  // ---------- Own picture ----------
  let avatar = null;
  function applyAvatar(root = document) {
    for (const img of root.querySelectorAll(".user_heading_avatar img")) {
      if (img.closest(PANEL)) continue;
      if (!("ucpnbOriginal" in img.dataset)) img.dataset.ucpnbOriginal = img.getAttribute("src") ?? "";
      const src = avatar || img.dataset.ucpnbOriginal;
      if (img.getAttribute("src") !== src) img.setAttribute("src", src);
      img.style.objectFit = avatar ? "cover" : "";
    }
  }
  const avatarObserver = new MutationObserver((mutations) => {
    for (const m of mutations) for (const node of m.addedNodes) if (node.nodeType === 1) applyAvatar(node);
  });
  const watchAvatar = () => {
    applyAvatar();
    avatarObserver.observe(document.body, { childList: true, subtree: true });
  };
  if (document.body && document.readyState !== "loading") watchAvatar();
  else document.addEventListener("DOMContentLoaded", watchAvatar, { once: true });
  chrome.storage.local.get(AVATAR_KEY).then((saved) => {
    avatar = saved[AVATAR_KEY] ?? null;
    if (document.body) applyAvatar();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(AVATAR_KEY in changes)) return;
    avatar = changes[AVATAR_KEY].newValue ?? null;
    applyAvatar();
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
    preference = saved[KEY] ?? "light";
    style = saved[STYLE_KEY] ?? "noticeboard";
    apply();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(KEY in changes || STYLE_KEY in changes)) return;
    if (KEY in changes) preference = changes[KEY].newValue ?? "light";
    if (STYLE_KEY in changes) style = changes[STYLE_KEY].newValue ?? "noticeboard";
    apply();
  });
  deviceDark.addEventListener("change", apply);
})();
