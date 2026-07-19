import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// Content scripts declared in manifest.json cannot be ES modules, so each
// entry is built independently as a single self-contained IIFE file.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "src/content/index.tsx"),
      output: {
        entryFileNames: "content.js",
        format: "iife",
      },
    },
  },
});
