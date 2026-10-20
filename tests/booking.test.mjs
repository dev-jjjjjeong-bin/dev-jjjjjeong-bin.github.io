import { validateIntake } from "../server/intake.js";
import test from "node:test";
import assert from "node:assert/strict";
import { appointment, phoneNumber, requestChange, adminDecision, publicBooking, HttpError } from "../server/domain.js";
import { handle } from "../server/api.js";
import { encode, decode } from "../server/firestore.js";

const intake = { birthDate: "1990-05-12", gender: "female", referralSources: ["search", "friend"],
  visitPurpose: "일상에서 편안하게 움직이기", treatmentHistory: ["manual"], exerciseHistory: ["pilates", "gym"], requests: "방문 전 안내 부탁드립니다." };
const now = Date.parse("2026-10-20T10:00:00+09:00");
const original = { id: "booking-test-00001", name: "테스트 고객", phone: "01012345678", phoneHash: "secret",
  date: "2026-10-21", time: "10:00", status: "confirmed", change: null };
test("휴대전화 정규화 및 잘못된 번호 거부", () => {
  assert.equal(phoneNumber("+82 10-1234-5678"), "01012345678");
  for (const bad of ["0317786535", "010000", "", null, "010<script>12345678"]) assert.throws(() => phoneNumber(bad));
});
test("한국 시간, 영업시간, 일요일, 실제 달력 날짜 검증", () => {
  assert.deepEqual(appointment({ date: "2026-10-21", time: "20:00" }, now), { date: "2026-10-21", time: "20:00" });
  for (const slot of [
    { date: "2026-10-20", time: "09:00" }, { date: "2026-10-25", time: "10:00" },
    { date: "2026-10-24", time: "12:30" }, { date: "2026-10-21", time: "20:30" },
    { date: "2026-10-21", time: "10:15" }, { date: "2026-11-31", time: "10:00" },
    { date: "2027-10-21", time: "10:00" },
  ]) assert.throws(() => appointment(slot, now));
});
test("변경·취소 요청으로 확정 일정을 즉시 바꾸지 않음", () => {
  const changed = requestChange(original, { type: "reschedule", date: "2026-10-22", time: "11:00" }, now);
  assert.equal(changed.date, original.date); assert.equal(changed.status, "confirmed");
  assert.equal(changed.change.date, "2026-10-22");
  const approved = adminDecision(changed, { action: "approve-change" }, now);
  assert.equal(approved.date, "2026-10-22"); assert.equal(approved.change, null);
  const rejected = adminDecision(changed, { action: "reject-change" }, now);
  assert.equal(rejected.date, original.date);
  const cancel = requestChange(original, { type: "cancel" }, now);
  assert.equal(cancel.status, "confirmed");
  assert.equal(adminDecision(cancel, { action: "approve-change" }, now).status, "cancelled");
  assert.throws(() => requestChange(changed, { type: "cancel" }, now));
});
test("고객 조회 결과에 이름·연락처·해시·관리자 이력 노출 없음", () => {
  assert.deepEqual(Object.keys(publicBooking({ ...original, intake, healthConsent: true, updatedBy: "admin" })).sort(), ["change","date","id","status","time"]);
});
test("Firestore 형식 왕복 변환", () => {
  const input = { ...original, count: 1, consent: true, items: ["a"], change: { type: "cancel" } };
  assert.deepEqual(decode(encode(input)), input);
});

export class MemoryDb {
  data = new Map(); sequence = 0;
  async get(collection, id) { return structuredClone(this.data.get(`${collection}/${id}`) || null); }
  async save(collection, id, value, version) {
    const key = `${collection}/${id}`, current = this.data.get(key);
    if (current ? current.version !== version : version) throw new HttpError(409, "충돌");
    this.data.set(key, { ...structuredClone(value), id, version: String(++this.sequence) });
  }
  async remove(collection, id, version) {
    if (this.data.get(`${collection}/${id}`)?.version !== version) throw new HttpError(409, "충돌");
    this.data.delete(`${collection}/${id}`);
  }
  async query(collection, { field, value, limit = 50 } = {}) {
    return [...this.data.entries()].filter(([key, doc]) => key.startsWith(`${collection}/`) && (!field || doc[field] === value)).map(([, doc]) => structuredClone(doc)).slice(0, limit);
  }
}
const env = Object.fromEntries(["FIREBASE_PROJECT_ID", "FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN", "FIREBASE_APP_ID", "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY", "PHONE_HASH_SECRET", "ADMIN_UIDS", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"].map(k => [k, "test"]));
env.SITE_ORIGIN = "https://example.test";
function req(path, body, origin = env.SITE_ORIGIN) {
  return new Request(`${env.SITE_ORIGIN}/api/booking/${path}`, { method: "POST", headers: {
    Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1",
  }, body: JSON.stringify(body) });
}
function futureSlot() {
  const date = new Date(Date.now() + 2 * 86400000);
  while (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return { date: date.toISOString().slice(0, 10), time: "10:00" };
}
test("신청 → 조회 → 변경 요청 → 관리자 승인; 재시도는 중복 생성하지 않음", async () => {
  const db = new MemoryDb(), dependencies = { db, challenge: async () => {}, verifyAdmin: async () => "test-admin" };
  const input = { ...futureSlot(), intake, healthConsent: true, name: "테스트", phone: "010-1234-5678", consent: true, requestId: crypto.randomUUID(), productId: "sohn-stretch", price: 1 };
  assert.equal((await handle(req("create", input), env, dependencies)).status, 201);
  assert.equal((await handle(req("create", input), env, dependencies)).status, 200);
  const lookup = await (await handle(req("lookup", { phone: input.phone }), env, dependencies)).json();
  assert.equal(lookup.records.length, 1); assert.equal(lookup.records[0].status, "pending");
  assert.ok(!JSON.stringify(lookup).includes("테스트")); assert.ok(!JSON.stringify(lookup).includes("010"));
  const id = lookup.records[0].id;
  assert.equal((await handle(req("change", { id, phone: "01099998888", type: "cancel" }), env, dependencies)).status, 404);
  assert.equal((await handle(req("change", { id, phone: input.phone, type: "cancel" }), env, dependencies)).status, 200);
  const record = await db.get("bookings", id);
  assert.deepEqual(record.intake, intake);
  assert.equal(record.healthConsent, true);
  const adminList = await (await handle(req("admin/list", {}), env, dependencies)).json();
  assert.deepEqual(adminList.records[0].intake, intake);
  assert.ok(!JSON.stringify(lookup).includes("birthDate"));
  assert.ok(!JSON.stringify(lookup).includes("visitPurpose"));
  assert.equal(record.price, 70000); assert.equal(record.productId, "sohn-stretch");
  assert.equal(record.status, "pending");
  assert.equal((await handle(req("admin/decide", { id, version: "stale", action: "approve-change" }), env, dependencies)).status, 409);
  assert.equal((await handle(req("admin/decide", { id, version: record.version, action: "approve-change" }), env, dependencies)).status, 200);
  assert.equal((await db.get("bookings", id)).status, "cancelled");
});
test("임의 상품 및 당일 취소 요청 거부", async () => {
  const dependencies = { db: new MemoryDb(), challenge: async () => {} };
  const input = { ...futureSlot(), name: "테스트", phone: "01012345678", consent: true, requestId: crypto.randomUUID(), productId: "fake" };
  assert.equal((await handle(req("create", input), env, dependencies)).status, 400);
  assert.throws(() => requestChange({ ...original, date: "2026-10-20", time: "18:00" }, { type: "cancel" }, now));
});
test("서비스 미설정, 교차 출처, 비로그인 관리자, 인증 없는 공개 요청 차단", async () => {
  assert.equal((await handle(req("create", {}), {})).status, 503);
  assert.equal((await handle(req("create", {}, "https://evil.test"), env)).status, 403);
  assert.equal((await handle(req("admin/list", {}), env)).status, 401);
  assert.equal((await handle(req("lookup", { phone: "01012345678" }), env)).status, 400);
});
test("과도한 조회 제한 및 캐시 금지", async () => {
  const dependencies = { db: new MemoryDb(), challenge: async () => {} };
  let response;
  for (let i = 0; i < 31; i++) response = await handle(req("lookup", { phone: "01012345678" }), env, dependencies);
  assert.equal(response.status, 429); assert.match(response.headers.get("Cache-Control"), /no-store/);
});
test("동시에 수정할 경우 한 번만 저장", async () => {
  const db = new MemoryDb();
  await db.save("bookings", original.id, original);
  const record = await db.get("bookings", original.id);
  const result = await Promise.allSettled([db.save("bookings", record.id, record, record.version), db.save("bookings", record.id, record, record.version)]);
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
});
test("Firebase가 확인한 계정도 허용된 UID·프로젝트·유효기간을 모두 검사", async () => {
  const originalFetch = globalThis.fetch;
  const seconds = Math.floor(Date.now() / 1000);
  let user = {
    localId: "test", emailVerified: true, validSince: String(seconds - 10),
    providerUserInfo: [{ providerId: "password" }],
  };
  globalThis.fetch = async () => Response.json({ users: [user] });
  const send = async overrides => {
    const payload = { aud: "test", iss: "https://securetoken.google.com/test", sub: "test", iat: seconds, exp: seconds + 60, firebase: { sign_in_provider: "password" }, ...overrides };
    const request = req("admin/list", {});
    request.headers.set("Authorization", `Bearer header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`);
    return handle(request, env, { db: new MemoryDb() });
  };
  try {
    assert.equal((await send({})).status, 200);
    assert.equal((await send({ firebase: { sign_in_provider: "google.com" } })).status, 403);
    assert.equal((await send({ firebase: undefined })).status, 403);
    user.emailVerified = false;
    assert.equal((await send({})).status, 403);
    user.emailVerified = true; user.disabled = true;
    assert.equal((await send({})).status, 403);
    user.disabled = false; user.providerUserInfo = [{ providerId: "google.com" }];
    assert.equal((await send({})).status, 403);
    user.providerUserInfo = [{ providerId: "password" }];
    user.localId = "not-allowed";
    assert.equal((await send({ sub: "not-allowed" })).status, 403);
    user.localId = "test";
    assert.equal((await send({ aud: "other-project" })).status, 403);
    assert.equal((await send({ sub: "another-user" })).status, 403);
    assert.equal((await send({ exp: seconds - 1 })).status, 403);
    assert.equal((await send({ iat: seconds - 20 })).status, 403);
    const request = req("admin/list", {});
    request.headers.set("Authorization", "Bearer invalid");
    assert.equal((await handle(request, env, { db: new MemoryDb() })).status, 401);
  } finally { globalThis.fetch = originalFetch; }
});

test("사전 상담 정보의 날짜·필수 질문·선택지·글자 수 검증", () => {
  assert.deepEqual(validateIntake(intake, now), intake);
  assert.equal(validateIntake({ ...intake, birthDate: "2000-02-29", requests: undefined }, now).requests, "");
  for (const patch of [
    { birthDate: "2026-02-30" }, { birthDate: "2027-01-01" }, { birthDate: "1899-12-31" },
    { gender: "invalid" }, { referralSources: [] }, { referralSources: ["fake"] },
    { referralSources: ["search", "search"] }, { treatmentHistory: ["none", "surgery"] },
    { exerciseHistory: ["none", "pt"] }, { treatmentHistory: "manual" },
    { visitPurpose: "   " }, { visitPurpose: "가".repeat(1001) }, { requests: "가".repeat(501) },
  ]) assert.throws(() => validateIntake({ ...intake, ...patch }, now));
  assert.throws(() => validateIntake(null, now));
});
test("추가 상담 정보 또는 건강 정보 동의가 없으면 저장하지 않음", async () => {
  for (const patch of [{ intake: undefined }, { healthConsent: false }, { intake: { ...intake, exerciseHistory: [] } }]) {
    const db = new MemoryDb();
    const input = { ...futureSlot(), name: "테스트", phone: "01012345678", consent: true, healthConsent: true,
      intake, productId: "sohn-stretch", requestId: crypto.randomUUID(), ...patch };
    assert.equal((await handle(req("create", input), env, { db, challenge: async () => {} })).status, 400);
    assert.equal((await db.query("bookings")).length, 0);
  }
});
