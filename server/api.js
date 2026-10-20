import { validateIntake } from "./intake.js";
import { appointment, phoneNumber, publicBooking, requestChange, adminDecision, check, HttpError } from "./domain.js";
import { Firestore, fingerprint } from "./firestore.js";
import { products } from "../js/booking-products.js";

const required = ["FIREBASE_PROJECT_ID", "FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN", "FIREBASE_APP_ID",
  "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "PHONE_HASH_SECRET", "ADMIN_UIDS", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "SITE_ORIGIN"];
export const configured = env => required.every(key => typeof env[key] === "string" && env[key].trim());
const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store, private",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });

async function verifyAdmin(request, env) {
  const match = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/);
  check(match && match[1].length < 5000, "관리자 로그인이 필요합니다.", 401);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: match[1] }),
  });
  check(response.ok, "다시 로그인해 주세요.", 401);
  const user = (await response.json()).users?.[0];
  let claims;
  try { claims = JSON.parse(atob(match[1].split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { throw new HttpError(401, "다시 로그인해 주세요."); }
  check(user && !user.disabled && user.emailVerified &&
    claims.aud === env.FIREBASE_PROJECT_ID && claims.iss === `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` &&
    claims.sub === user.localId && claims.exp * 1000 > Date.now() && claims.iat >= Number(user.validSince || 0) &&
    claims.firebase?.sign_in_provider === "password" &&
    user.providerUserInfo?.some(provider => provider.providerId === "password") &&
    env.ADMIN_UIDS.split(",").map(s => s.trim()).includes(user.localId),
  "예약 관리 권한이 없는 계정입니다.", 403);
  return user.localId;
}
async function challenge(request, input, env) {
  check(typeof input.challenge === "string" && input.challenge.length <= 3000, "확인 절차를 완료해 주세요.");
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST", body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY, response: input.challenge,
      ...(request.headers.get("CF-Connecting-IP") ? { remoteip: request.headers.get("CF-Connecting-IP") } : {}),
    }),
  });
  const result = await response.json();
  check(result.success && result.hostname === new URL(env.SITE_ORIGIN).hostname, "확인 시간이 만료되었습니다. 다시 확인해 주세요.", 400);
}
async function rateLimit(db, env, key, limit = 30, windowMs = 900000) {
  const id = await fingerprint(env.PHONE_HASH_SECRET, `rate:${key}`);
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await db.get("bookingLimits", id);
    const window = Math.floor(Date.now() / windowMs);
    const count = current?.window === window ? current.count : 0;
    check(count < limit, "요청이 많습니다. 잠시 후 다시 이용하거나 센터로 연락해 주세요.", 429);
    try {
      await db.save("bookingLimits", id, { count: count + 1, window, createdAt: new Date().toISOString() }, current?.version);
      return;
    } catch (error) { if (error.status !== 409 || attempt === 3) throw error; }
  }
}
export async function handle(request, env, dependencies = {}) {
  try {
    const path = new URL(request.url).pathname.replace(/\/$/, "");
    if (path === "/api/booking/config" && request.method === "GET") {
      return json({ ready: Boolean(configured(env)), ...(configured(env) ? {
        turnstileSiteKey: env.TURNSTILE_SITE_KEY,
        firebase: { apiKey: env.FIREBASE_API_KEY, projectId: env.FIREBASE_PROJECT_ID, authDomain: env.FIREBASE_AUTH_DOMAIN, appId: env.FIREBASE_APP_ID },
      } : {}) });
    }
    check(configured(env), "온라인 예약을 준비 중입니다. 031-778-6535로 문의해 주세요.", 503);
    check(request.method === "POST", "지원하지 않는 요청입니다.", 405);
    check(request.headers.get("Origin") === env.SITE_ORIGIN && new URL(request.url).origin === env.SITE_ORIGIN,
      "허용되지 않은 요청입니다.", 403);
    check(request.headers.get("Content-Type")?.startsWith("application/json"), "요청 형식이 올바르지 않습니다.", 415);
    const raw = await request.text();
    check(raw.length <= 10000, "요청 내용이 너무 큽니다.", 413);
    let input;
    try { input = JSON.parse(raw); } catch { throw new HttpError(400, "요청 형식이 올바르지 않습니다."); }
    check(input && typeof input === "object" && !Array.isArray(input), "요청 형식이 올바르지 않습니다.");
    const db = dependencies.db || new Firestore(env);
    if (path.startsWith("/api/booking/admin/")) {
      const uid = await (dependencies.verifyAdmin || verifyAdmin)(request, env);
      if (path.endsWith("/list")) {
        if (input.after) check(typeof input.after.createdAt === "string" && /^[\w-]{10,80}$/.test(input.after.id), "잘못된 조회 위치입니다.");
        const records = await db.query("bookings", { after: input.after, limit: 50 });
        return json({ records, next: records.length === 50 ? { createdAt: records.at(-1).createdAt, id: records.at(-1).id } : null });
      }
      check(/^[\w-]{10,80}$/.test(input.id), "예약을 다시 선택해 주세요.");
      const record = await db.get("bookings", input.id);
      check(record, "예약을 찾을 수 없습니다.", 404);
      check(input.version === record.version, "예약이 변경되었습니다. 새로 조회해 주세요.", 409);
      if (path.endsWith("/delete")) {
        check(["cancelled", "declined", "completed"].includes(record.status), "종료된 예약만 삭제할 수 있습니다.", 409);
        await db.remove("bookings", record.id, record.version);
        return json({ ok: true });
      }
      check(path.endsWith("/decide"), "존재하지 않는 요청입니다.", 404);
      await db.save("bookings", record.id, { ...adminDecision(record, input), updatedAt: new Date().toISOString(), updatedBy: uid }, record.version);
      return json({ ok: true });
    }
    check(["/api/booking/create", "/api/booking/lookup", "/api/booking/change"].includes(path), "존재하지 않는 요청입니다.", 404);
    await (dependencies.challenge || challenge)(request, input, env);
    await rateLimit(db, env, `ip:${request.headers.get("CF-Connecting-IP") || "unknown"}`);
    const phone = phoneNumber(input.phone);
    const phoneHash = await fingerprint(env.PHONE_HASH_SECRET, `phone:${phone}`);
    if (path.endsWith("/lookup")) {
      const records = await db.query("bookings", { field: "phoneHash", value: phoneHash, limit: 100 });
      return json({ records: records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(publicBooking) });
    }
    if (path.endsWith("/create")) {
      const product = products.find(p => p.id === input.productId);
      check(product, "상담·체험 상품을 선택해 주세요.");
      check(typeof input.name === "string" && input.name.trim().length >= 2 && input.name.trim().length <= 40, "성함은 2~40자로 입력해 주세요.");
      check(input.consent === true, "개인정보 수집·이용에 동의해 주세요.");
      check(typeof input.requestId === "string" && /^[a-f0-9-]{36}$/.test(input.requestId), "신청 화면을 새로 열어 주세요.");
      const id = await fingerprint(env.PHONE_HASH_SECRET, `request:${phone}:${input.requestId}`);
      if (await db.get("bookings", id)) return json({ ok: true }); // Retry after an interrupted response.
      check(input.healthConsent === true, "건강 관련 정보 수집·이용에 동의해 주세요.");
      const intake = validateIntake(input.intake);
      const schedule = appointment(input);
      await rateLimit(db, env, `create:${phoneHash}`, 5, 86400000);
      const existing = await db.query("bookings", { field: "phoneHash", value: phoneHash, limit: 100 });
      check(!existing.some(r => ["pending", "confirmed"].includes(r.status) && r.date === schedule.date && r.time === schedule.time),
        "이미 같은 일시로 신청되어 있습니다. 예약 조회에서 확인해 주세요.", 409);
      await db.save("bookings", id, { ...schedule, productId: product.id, price: product.price, duration: product.duration,
        phone, phoneHash, name: input.name.trim(), status: "pending", change: null,
        intake, healthConsent: true, healthConsentVersion: "2026-10-20-intake-v1",
        consentVersion: "2026-10-20-intake-v1", createdAt: new Date().toISOString() });
      return json({ ok: true }, 201);
    }
    check(typeof input.id === "string" && /^[\w-]{10,80}$/.test(input.id), "예약을 다시 조회해 주세요.");
    const record = await db.get("bookings", input.id);
    check(record && record.phoneHash === phoneHash, "예약을 다시 조회해 주세요.", 404);
    await rateLimit(db, env, `change:${phoneHash}`, 5, 86400000);
    await db.save("bookings", record.id, { ...requestChange(record, input), updatedAt: new Date().toISOString() }, record.version);
    return json({ ok: true });
  } catch (error) {
    // Never log request bodies, phone numbers, tokens or upstream credentials.
    return json({ error: error instanceof HttpError ? error.message : "일시적으로 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." }, error.status || 500);
  }
}
