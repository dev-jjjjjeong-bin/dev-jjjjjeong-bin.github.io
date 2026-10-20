import { readFile, stat, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "");
let config;
try {
  config = JSON.parse(await readFile(resolve(repo, ".booking-local.json"), "utf8"));
} catch {
  console.error("로컬 설정 파일이 필요합니다. .booking-local.example.json을 .booking-local.json으로 복사하고 docs/reservation-setup.md를 확인하세요.");
  process.exit(1);
}
for (const key of ["serviceAccountFile", "phoneSecretFile", "apiKey", "authDomain", "appId", "adminUids"]) {
  if (typeof config[key] !== "string" || !config[key].trim()) throw new Error(`Missing local setting: ${key}`);
}
const credentials = JSON.parse(await readFile(resolve(repo, config.serviceAccountFile), "utf8"));
const secretFile = await readFile(resolve(repo, config.phoneSecretFile), "utf8");
const matches = secretFile.match(/\b[a-fA-F0-9]{64}\b/g) || [];
if (matches.length !== 1) throw new Error("Expected one phone secret");
const env = {
  SITE_ORIGIN: "http://localhost:8790",
  FIREBASE_PROJECT_ID: credentials.project_id,
  FIREBASE_CLIENT_EMAIL: credentials.client_email,
  FIREBASE_PRIVATE_KEY: credentials.private_key,
  PHONE_HASH_SECRET: matches[0],
  FIREBASE_API_KEY: config.apiKey,
  FIREBASE_AUTH_DOMAIN: config.authDomain,
  FIREBASE_APP_ID: config.appId,
  ADMIN_UIDS: config.adminUids,
  TELEGRAM_BOT_TOKEN: config.telegramBotToken || "",
  TELEGRAM_CHAT_ID: config.telegramChatId || "",
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
};
const { handle } = await import(pathToFileURL(resolve(repo, "server/api.js")));
const { Firestore } = await import(pathToFileURL(resolve(repo, "server/firestore.js")));
const db = new Firestore(env);
await db.query("bookings", { field: "phoneHash", value: "local-connection-check-no-customer", limit: 1 });
console.log("Firestore authentication and booking index: OK");
// Local-only adapter: official dummy keys report example.com, not the browser host.
// Production code and the real Turnstile widget are not modified.
const testDependencies = {
  challenge: async (_request, input) => {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: input.challenge || "" }),
    });
    const result = await response.json();
    if (!result.success || result.metadata?.result_with_testing_key !== true ||
        !["example.com", "localhost"].includes(result.hostname)) {
      throw Object.assign(new Error("Test challenge rejected"), { status: 400 });
    }
  },
};
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
createServer(async (req, res) => {
  try {
    if (req.headers.host !== "localhost:8790") { res.writeHead(403); return res.end("Use http://localhost:8790"); }
    const url = new URL(req.url, env.SITE_ORIGIN);
    if (url.pathname.startsWith("/api/booking/")) {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 10000) { res.writeHead(413); return res.end("Request too large"); }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const request = new Request(url, {
        method: req.method, headers: { ...req.headers, "CF-Connecting-IP": "127.0.0.1" },
        ...(body.length ? { body } : {}),
      });
      const response = await handle(request, env, testDependencies);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = resolve(repo, `.${rel}`);
    const allowed = /^\/(?:[^/]+\.html|(?:css|js|images|activities)\/)/.test(rel);
    if (!allowed || !file.startsWith(repo + sep) || !(await stat(file)).isFile()) {
      res.writeHead(404); return res.end("Not found");
    }
    const resolved = await realpath(file);
    const relative = "/" + resolved.slice(repo.length + 1);
    if (!resolved.startsWith(repo + sep) || !/^\/(?:[^/]+\.html|(?:css|js|images|activities)\/)/.test(relative)) {
      res.writeHead(404); return res.end("Not found");
    }
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end('{"error":"Local test server error"}');
  }
}).on("error", error => {
  console.error(error.code === "EADDRINUSE" ? "8790 포트가 사용 중입니다. 기존 테스트 서버를 Ctrl+C로 종료하세요." : "로컬 서버를 실행하지 못했습니다.");
  process.exitCode = 1;
}).listen(8790, "127.0.0.1", () => {
  console.log(`로컬 테스트 · 연결 DB: ${env.FIREBASE_PROJECT_ID} (입력한 예약은 실제 저장됩니다)`);
  console.log("Home: http://localhost:8790/\nReservation: http://localhost:8790/reservation.html\nAdmin: http://localhost:8790/admin.html\n종료: Ctrl+C");
});
