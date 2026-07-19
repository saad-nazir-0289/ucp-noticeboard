// Copies files Chrome needs alongside the built JS/CSS (Vite doesn't touch these).
import { copyFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");

mkdirSync(dist, { recursive: true });
copyFileSync(resolve(root, "manifest.json"), resolve(dist, "manifest.json"));
copyFileSync(resolve(root, "public/icon128.png"), resolve(dist, "icon128.png"));

console.log("Copied manifest.json and icon128.png into dist/");
