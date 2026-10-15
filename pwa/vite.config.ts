import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { execSync } from "child_process";

// Code in ../shared is compiled into this app (see shared/README.md).
// dedupe makes its `react` imports resolve from this app's node_modules,
// since shared/ has none of its own.
const sharedConfig = {
  resolve: {
    alias: { "@shared": resolve(__dirname, "../shared") },
    dedupe: ["react", "react-dom"],
  },
};

const PRODUCTION_API_URL = "https://ucpnb-api.duckdns.org";
const LOCAL_API_URL = "http://localhost:5000";

// Which backend this build talks to, decided by Vite's --mode:
//   production (npm run build)          → the live API (Oracle server)
//   development (npm run dev)           → a backend on this machine
//   staging (npm run build:staging)     → VITE_API_BASE_URL, which must be
//                                         set (env var or .env.staging.local)
// An explicit VITE_API_BASE_URL always wins, in any mode.
function resolveApiUrl(mode: string): string {
  const fromEnv = loadEnv(mode, process.cwd(), "VITE_").VITE_API_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (mode === "production") return PRODUCTION_API_URL;
  if (mode === "development" || mode === "test") return LOCAL_API_URL;
  throw new Error(
    `VITE_API_BASE_URL must be set for --mode ${mode} (e.g. in .env.${mode}.local). ` +
      "Refusing to guess, so a staging build can never silently talk to production."
  );
}

// The commit being built, shown in the account menu so anyone can tell
// which version a phone is running. Cloudflare's builds name it in an
// environment variable; elsewhere git knows.
function appVersion(): string {
  const fromCi = process.env.WORKERS_CI_COMMIT_SHA ?? process.env.CF_PAGES_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
}

// A plain static build — this is a real standalone site (not injected
// into any host page like the extension), so a standard Vite React app
// is all that's needed. Deploys as-is to Cloudflare Pages/Netlify/Vercel.
export default defineConfig(({ mode }) => {
  // Written back into process.env so Vite exposes it everywhere it
  // exposes env vars: import.meta.env in code and %VITE_API_BASE_URL% in
  // index.html.
  process.env.VITE_API_BASE_URL = resolveApiUrl(mode);

  return {
    plugins: [react()],
    ...sharedConfig,
    define: { __APP_VERSION__: JSON.stringify(appVersion()) },
    // The dev server only serves files inside the project by default.
    server: { fs: { allow: [__dirname, resolve(__dirname, "../shared")] } },
    build: {
      // Only production builds land in dist/ (what wrangler deploys to
      // the live site); staging goes to dist-staging/.
      outDir: mode === "production" ? "dist" : `dist-${mode}`,
    },
  };
});
