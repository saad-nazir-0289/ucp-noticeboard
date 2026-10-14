import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const PRODUCTION_API_URL = "https://ucp-noticeboard-api-production.up.railway.app";
const LOCAL_API_URL = "http://localhost:5000";

// Which backend this build talks to, decided by Vite's --mode:
//   production (npm run build)          → the live Railway API
//   development (npm run dev)           → a backend on this machine
//   staging (npm run build:staging)     → VITE_API_BASE_URL, which must be
//                                         set (env var or .env.staging.local)
// An explicit VITE_API_BASE_URL always wins, in any mode.
function resolveApiUrl(mode: string): string {
  const fromEnv = loadEnv(mode, process.cwd(), "VITE_").VITE_API_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (mode === "production") return PRODUCTION_API_URL;
  if (mode === "development") return LOCAL_API_URL;
  throw new Error(
    `VITE_API_BASE_URL must be set for --mode ${mode} (e.g. in .env.${mode}.local). ` +
      "Refusing to guess, so a staging build can never silently talk to production."
  );
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
    build: {
      outDir: "dist",
    },
  };
});
