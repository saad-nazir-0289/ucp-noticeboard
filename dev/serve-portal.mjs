// Serves the mock UCP portal (dev/portal) with the locally built extension
// (extension/dist-local) mounted at /extension, plus demo posters at
// /posters (used by the seeded demo notices). Build the extension first with
// `npm run build:local` in extension/, so it talks to the local backend.
//
//   node dev/serve-portal.mjs [port]     (default 5174)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const roots = {
  "/extension/": resolve(here, "../extension/dist-local"),
  "/": resolve(here, "portal"),
};
const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const port = Number(process.argv[2] ?? 5174);

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const [prefix, root] = Object.entries(roots).find(([p]) => path.startsWith(p));
  const relative = path.slice(prefix.length) || "index.html";
  const file = normalize(join(root, relative));

  if (!file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Mock UCP portal: http://localhost:${port}/`);
});
