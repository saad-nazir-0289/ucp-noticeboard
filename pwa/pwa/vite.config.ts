import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// A plain static build — this is a real standalone site (not injected
// into any host page like the extension), so a standard Vite React app
// is all that's needed. Deploys as-is to Cloudflare Pages/Netlify/Vercel.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
