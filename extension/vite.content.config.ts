import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import QRCode from "qrcode";

// Code in ../shared is compiled into this app (see shared/README.md).
// dedupe makes its `react` imports resolve from this app's node_modules,
// since shared/ has none of its own.
const sharedConfig = {
  resolve: {
    alias: { "@shared": resolve(__dirname, "../shared") },
    dedupe: ["react", "react-dom"],
  },
};

const PRODUCTION = {
  VITE_API_BASE_URL: "https://ucpnb-api.duckdns.org",
  VITE_PWA_BASE_URL: "https://ucp-noticeboard.msndev.workers.dev",
};
const LOCAL = {
  VITE_API_BASE_URL: "http://localhost:5000",
  VITE_PWA_BASE_URL: "http://localhost:5173",
};

// Which backend and PWA this build points at, decided by Vite's --mode:
//   production (npm run build)                 → the live API and PWA
//   development (npm run dev / build:local)    → both on this machine
//   staging (npm run build:staging)            → VITE_API_BASE_URL and
//        VITE_PWA_BASE_URL, which must both be set (env vars or
//        .env.staging.local)
// Explicitly set variables always win, in any mode.
function resolveUrls(mode: string): typeof PRODUCTION {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const defaults = mode === "production" ? PRODUCTION : mode === "development" ? LOCAL : undefined;
  const resolved = {} as typeof PRODUCTION;
  for (const key of Object.keys(PRODUCTION) as (keyof typeof PRODUCTION)[]) {
    const value = env[key] || defaults?.[key];
    if (!value) {
      throw new Error(
        `${key} must be set for --mode ${mode} (e.g. in .env.${mode}.local). ` +
          "Refusing to guess, so a staging build can never silently talk to production."
      );
    }
    resolved[key] = value.replace(/\/+$/, "");
  }
  return resolved;
}

const MODE_LABELS: Record<string, string> = { development: "Local", staging: "Staging" };

// Only production builds land in dist/ — the folder that gets zipped for
// the Chrome Web Store — so a local or staging build can't be shipped by
// accident. Others go to dist-local/ and dist-staging/.
const outDirFor = (mode: string) =>
  mode === "production" ? "dist" : `dist-${MODE_LABELS[mode]?.toLowerCase() ?? mode}`;

// Writes dist/manifest.json and the icon. Production gets manifest.json
// verbatim; any other mode is renamed, so it's obvious which one is loaded
// in chrome://extensions.
//
// The manifest deliberately has no permission for the API or Cloudinary:
// the content script's requests are ordinary cross-origin requests from
// the portal page, allowed by the API's CORS settings (and Cloudinary's).
// A host permission there would only tie the extension to one API address:
// changing it in an update makes Chrome disable the extension until each
// student re-approves it.
//
// It also copies the toolbar menu (popup/), writing popup-config.js with
// this build's PWA address and qr-notifications.svg (the QR code students
// scan with their phone to turn on notifications, drawn here so the menu
// loads nothing from the internet), and writes background.js: it tells Chrome which page to
// open when the extension is removed (the PWA's one-question "why?" page),
// and marks installs and updates for the introduction; neither needs a
// permission. Generated here so it carries this build's PWA
// address.
function extensionManifest(mode: string, outDir: string, pwaBaseUrl: string): Plugin {
  return {
    name: "extension-manifest",
    async closeBundle() {
      const root = __dirname;
      const dist = resolve(root, outDir);
      mkdirSync(dist, { recursive: true });

      if (mode === "production") {
        copyFileSync(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
      } else {
        const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
        manifest.name = `${manifest.name} (${MODE_LABELS[mode] ?? mode})`;
        writeFileSync(resolve(dist, "manifest.json"), JSON.stringify(manifest, null, 2));
      }
      copyFileSync(resolve(root, "public/icon128.png"), resolve(dist, "icon128.png"));
      for (const file of ["popup.html", "popup.css", "popup.js", "whatsnew.js"]) {
        copyFileSync(resolve(root, "popup", file), resolve(dist, file));
      }
      // Horizon's look (horizon-theme/): NoticeBoard style and dark mode.
      for (const file of ["theme.js", "theme.css", "skin.css", "celebrate.js", "submit-watch.js", "keepalive.js", "due.js", "login.js", "login.css"]) {
        copyFileSync(resolve(root, "horizon-theme", file), resolve(dist, `horizon-${file}`));
      }
      writeFileSync(
        resolve(dist, "qr-notifications.svg"),
        await QRCode.toString(`${pwaBaseUrl}/?enableNotifications=1`, {
          type: "svg",
          margin: 1,
          errorCorrectionLevel: "M",
          color: { dark: "#0f172a", light: "#ffffff" },
        })
      );
      writeFileSync(
        resolve(dist, "popup-config.js"),
        `// Written by vite.content.config.ts: the web app this build opens.\nwindow.UCPNB_PWA_URL = ${JSON.stringify(pwaBaseUrl)};\n`
      );
      writeFileSync(
        resolve(dist, "background.js"),
        `// Written by vite.content.config.ts. When NoticeBoard is removed, Chrome opens
// a one-question page asking why (anonymous: only the reason and this version).
chrome.runtime.setUninstallURL(
  ${JSON.stringify(`${pwaBaseUrl}/?uninstalled=1&v=`)} + encodeURIComponent(chrome.runtime.getManifest().version)
);

// After installing or updating: "NEW" on the toolbar icon, and an
// introduction the first time Horizon or the menu opens (popup.js and
// horizon-theme/theme.js show it, then remove ucpnb_tour).
importScripts("whatsnew.js");
const TOUR_KEY = "ucpnb_tour";
const older = (a, b) => {
  const [x, y] = [a, b].map((v) => String(v).split(".").map(Number));
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
};
const showBadge = (on) => {
  chrome.action.setBadgeText({ text: on ? "NEW" : "" });
  if (on) chrome.action.setBadgeBackgroundColor({ color: "#6d5cf6" });
};
chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
  const version = chrome.runtime.getManifest().version;
  // An update only when there's something new since the version it came from.
  if (reason !== "install" && !(reason === "update" && older(previousVersion, UCPNB_WHATS_NEW.since))) return;
  chrome.storage.local.set({ [TOUR_KEY]: { reason, version } });
  showBadge(true);
});
// Chrome forgets the badge when it restarts.
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(TOUR_KEY).then((saved) => showBadge(Boolean(saved[TOUR_KEY])));
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && TOUR_KEY in changes && !changes[TOUR_KEY].newValue) showBadge(false);
});
`
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const urls = resolveUrls(mode);
  const outDir = outDirFor(mode);
  // Written back into process.env so Vite exposes them as import.meta.env.
  Object.assign(process.env, urls);

  return {
    plugins: [react(), extensionManifest(mode, outDir, urls.VITE_PWA_BASE_URL)],
    ...sharedConfig,
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, "src/content/index.tsx"),
        output: {
          entryFileNames: "content.js",
          format: "iife",
        },
      },
    },
  };
});
