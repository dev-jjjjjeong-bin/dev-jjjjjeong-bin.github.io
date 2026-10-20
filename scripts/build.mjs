import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const out = new URL("dist/", root);
// An allowlist prevents server sources, setup files and credentials becoming public assets.
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const entries = await readdir(root, { withFileTypes: true });
for (const entry of entries) {
  if ((entry.isFile() && (entry.name.endsWith(".html") || ["robots.txt", "sitemap.xml", "favicon.ico", "_headers", "_redirects", "_routes.json"].includes(entry.name))) ||
      (entry.isDirectory() && ["images", "css", "js", "activities"].includes(entry.name))) {
    await cp(new URL(entry.name, root), new URL(entry.name, out), { recursive: true });
  }
}
console.log(`Public website built: ${fileURLToPath(out)}`);
