import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

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
  VITE_API_BASE_URL: "https://ucp-noticeboard-api-production.up.railway.app",
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
// verbatim. Any other mode is renamed (so it's obvious which one is
// loaded in chrome://extensions) and its host_permissions point at that
// mode's API instead of production's.
function extensionManifest(mode: string, apiBaseUrl: string, outDir: string): Plugin {
  return {
    name: "extension-manifest",
    closeBundle() {
      const root = __dirname;
      const dist = resolve(root, outDir);
      mkdirSync(dist, { recursive: true });

      if (mode === "production") {
        copyFileSync(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
      } else {
        const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
        manifest.name = `${manifest.name} (${MODE_LABELS[mode] ?? mode})`;
        manifest.host_permissions = manifest.host_permissions.map((permission: string) =>
          permission.startsWith(PRODUCTION.VITE_API_BASE_URL) ? `${apiBaseUrl}/*` : permission
        );
        writeFileSync(resolve(dist, "manifest.json"), JSON.stringify(manifest, null, 2));
      }
      copyFileSync(resolve(root, "public/icon128.png"), resolve(dist, "icon128.png"));
    },
  };
}

export default defineConfig(({ mode }) => {
  const urls = resolveUrls(mode);
  const outDir = outDirFor(mode);
  // Written back into process.env so Vite exposes them as import.meta.env.
  Object.assign(process.env, urls);

  return {
    plugins: [react(), extensionManifest(mode, urls.VITE_API_BASE_URL, outDir)],
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
