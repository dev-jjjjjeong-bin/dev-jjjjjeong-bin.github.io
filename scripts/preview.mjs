import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const mime = { ".html":"text/html; charset=utf-8", ".css":"text/css", ".js":"text/javascript", ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".svg":"image/svg+xml" };
createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/api/booking/config") {
      res.writeHead(200, { "Content-Type":"application/json", "Cache-Control":"no-store" });
      return res.end('{"ready":false}');
    }
    const file = resolve(root, `.${decodeURIComponent(path === "/" ? "/index.html" : path)}`);
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) throw new Error("missing");
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control":"no-store" });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end("Not found"); }
}).listen(8788, "127.0.0.1", () => console.log("Preview: http://127.0.0.1:8788/reservation.html"));
