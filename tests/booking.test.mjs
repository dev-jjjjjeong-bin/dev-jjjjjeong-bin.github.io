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
  assert.deepEqual(Object.keys(publicBooking({ ...original, intake, healthConsent: true, updatedBy: "admin" })).sort(), ["change","date","id","product","status","time"]);
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

test("저장된 신청·변경·취소만 알림; 중복·조회·관리자 처리·실패 요청은 제외", async () => {
  const db = new MemoryDb(), events = [];
  const dependencies = { db, challenge: async () => {}, verifyAdmin: async () => "admin",
    notify: async event => {
      assert.equal((await db.query("bookings")).length, 1, "알림 전 예약 저장");
      events.push(event);
    } };
  const input = { ...futureSlot(), name: "테스트", phone: "01012345678", consent: true, healthConsent: true,
    intake, productId: "sohn-stretch", requestId: crypto.randomUUID() };
  assert.equal((await handle(req("create", { ...input, name: "" }), env, dependencies)).status, 400);
  assert.deepEqual(events, []);
  assert.equal((await handle(req("create", input), env, dependencies)).status, 201);
  assert.equal((await handle(req("create", input), env, dependencies)).status, 200);
  const lookup = await (await handle(req("lookup", { phone: input.phone }), env, dependencies)).json();
  const id = lookup.records[0].id;
  assert.deepEqual(events, ["create"]);
  assert.equal((await handle(req("change", { id, phone: input.phone, type: "reschedule", date: input.date, time: "11:00" }), env, dependencies)).status, 200);
  assert.equal((await handle(req("change", { id, phone: input.phone, type: "cancel" }), env, dependencies)).status, 409);
  assert.deepEqual(events, ["create", "reschedule"]);
  const record = await db.get("bookings", id);
  assert.equal((await handle(req("admin/decide", { id, version: record.version, action: "approve-change" }), env, dependencies)).status, 200);
  assert.equal((await handle(req("change", { id, phone: input.phone, type: "cancel" }), env, dependencies)).status, 200);
  assert.deepEqual(events, ["create", "reschedule", "cancel"]);
});

test("저장 실패에는 알림이 없고 알림 실패에도 저장된 예약은 접수 성공", async () => {
  const input = { ...futureSlot(), name: "테스트", phone: "01012345678", consent: true, healthConsent: true,
    intake, productId: "sohn-stretch", requestId: crypto.randomUUID() };
  const db = new MemoryDb(); let notified = false;
  const save = db.save.bind(db);
  db.save = async (collection, ...args) => {
    if (collection === "bookings") throw new Error("write failed");
    return save(collection, ...args);
  };
  assert.equal((await handle(req("create", input), env, { db, challenge: async () => {}, notify: async () => { notified = true; } })).status, 500);
  assert.equal(notified, false);
  db.save = save;
  const logs = []; const warn = console.warn;
  console.warn = message => logs.push(message);
  try {
    assert.equal((await handle(req("create", input), env, { db, challenge: async () => {},
      notify: async () => { throw new Error("private upstream details"); } })).status, 201);
    assert.equal((await db.query("bookings")).length, 1);
    assert.deepEqual(logs, ["telegram_notification_failed event=create code=unexpected"]);
  } finally { console.warn = warn; }
});

test("Cloudflare 백그라운드 발송 작업을 등록하고 설정 응답에는 텔레그램 비밀값 없음", async () => {
  const db = new MemoryDb(), pending = [];
  let finish;
  const notification = new Promise(resolve => { finish = resolve; });
  const input = { ...futureSlot(), name: "테스트", phone: "01012345678", consent: true, healthConsent: true,
    intake, productId: "sohn-stretch", requestId: crypto.randomUUID() };
  const response = await handle(req("create", input), env, { db, challenge: async () => {},
    notify: () => notification, waitUntil: task => pending.push(task) });
  assert.equal(response.status, 201); assert.equal(pending.length, 1);
  finish(); await Promise.all(pending);
  const config = await (await handle(new Request(`${env.SITE_ORIGIN}/api/booking/config`),
    { ...env, TELEGRAM_BOT_TOKEN: "private-telegram-token", TELEGRAM_CHAT_ID: "private-chat-id" })).text();
  assert.ok(!config.includes("private-telegram-token"));
  assert.ok(!config.includes("private-chat-id"));
});

test("관리자는 확인 대기·확정 예약의 일시를 직접 변경하고 상태·고객 정보는 유지", () => {
  for (const status of ["pending", "confirmed"]) {
    const record = { ...original, status, productId: "sohn-stretch", price: 70000, intake };
    const changed = adminDecision(record, { action: "reschedule", date: "2026-10-22", time: "11:00",
      status: "cancelled", phone: "01099999999", price: 1 }, now);
    assert.deepEqual(changed, { ...record, date: "2026-10-22", time: "11:00" });
    assert.equal(record.date, "2026-10-21", "입력 기록을 직접 변경하지 않음");
  }
});
test("관리자 직접 변경은 종료 상태·고객 요청 처리 중·잘못된 일시를 거부", () => {
  const input = { action: "reschedule", date: "2026-10-22", time: "11:00" };
  for (const status of ["cancelled", "declined", "completed"]) {
    assert.throws(() => adminDecision({ ...original, status }, input, now), error => error.status === 409);
  }
  for (const type of ["cancel", "reschedule"]) {
    assert.throws(() => adminDecision({ ...original, change: { type } }, input, now), error => error.status === 409);
  }
  for (const slot of [
    { date: original.date, time: original.time },
    { date: "2026-10-20", time: "09:00" },
    { date: "2026-10-25", time: "10:00" },
    { date: "2026-10-24", time: "13:00" },
    { date: "2026-10-22", time: "21:00" },
    { date: "2026-11-31", time: "10:00" },
    { date: "2027-10-22", time: "10:00" },
    { date: "2026-10-22", time: "10:30" },
  ]) assert.throws(() => adminDecision(original, { ...input, ...slot }, now), error => error.status === 400);
});
test("관리자 직접 변경 API: 인증·동시 수정 방지·고객 조회 반영·수정 관리자 기록", async () => {
  const db = new MemoryDb();
  const slot = futureSlot();
  const source = { ...original, ...slot, intake, productId: "sohn-stretch", price: 70000 };
  await db.save("bookings", original.id, source);
  const saved = await db.get("bookings", original.id);
  const input = { id: saved.id, version: saved.version, action: "reschedule", date: slot.date, time: "11:00" };
  const deps = { db, verifyAdmin: async () => "schedule-admin", notify: async () => { assert.fail("관리자 변경은 요청 알림을 발송하지 않음"); } };
  assert.equal((await handle(req("admin/decide", input), env, { db })).status, 401);
  assert.equal((await handle(req("admin/decide", input), env, { db, verifyAdmin: async () => { throw new HttpError(403, "권한 없음"); } })).status, 403);
  assert.equal((await handle(req("admin/decide", { ...input, version: "stale" }), env, deps)).status, 409);
  assert.equal((await db.get("bookings", original.id)).time, "10:00");
  const results = await Promise.all([handle(req("admin/decide", input), env, deps), handle(req("admin/decide", input), env, deps)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const changed = await db.get("bookings", original.id);
  assert.equal(changed.updatedBy, "schedule-admin");
  assert.ok(Number.isFinite(Date.parse(changed.updatedAt)));
  assert.equal(changed.status, "confirmed");
  assert.equal(changed.price, 70000); assert.deepEqual(changed.intake, intake);
  assert.equal(publicBooking(changed).time, "11:00");
  assert.equal(publicBooking(changed).change, null);
});

test("관리자 프로그램 단독 변경은 담당 상품·금액·시간을 카탈로그로 갱신", () => {
  for (const status of ["pending", "confirmed"]) {
    const source = { ...original, status, productId: "sohn-stretch", price: 70000, duration: 50, intake };
    const result = adminDecision(source, { action: "reschedule", date: source.date, time: source.time,
      productId: "yun-exercise", price: 1, duration: 999, status: "cancelled" }, now);
    assert.deepEqual(result, { ...source, productId: "yun-exercise", price: 50000, duration: 50 });
    const simultaneous = adminDecision(source, { action: "reschedule", date: "2026-10-22", time: "11:00", productId: "yun-maternity" }, now);
    assert.equal(simultaneous.date, "2026-10-22"); assert.equal(simultaneous.time, "11:00");
    assert.equal(simultaneous.productId, "yun-maternity"); assert.equal(simultaneous.price, 50000);
    const back = adminDecision(result, { action: "reschedule", date: result.date, time: result.time, productId: "sohn-exercise" }, now);
    assert.equal(back.price, 70000); assert.equal(back.status, status);
  }
});
test("동일 상품의 기존 약정 금액 유지; 미등록 상품·변경 없는 저장은 거부", () => {
  const source = { ...original, productId: "sohn-stretch", price: 65000, duration: 80 };
  const request = { action: "reschedule", date: source.date, time: "11:00", productId: source.productId, price: 1, duration: 1 };
  const result = adminDecision(source, request, now);
  assert.equal(result.price, 65000); assert.equal(result.duration, 80);
  for (const productId of ["", "fake", null, {}, ["yun-exercise"]]) {
    assert.throws(() => adminDecision(source, { ...request, productId }, now), error => error.status === 400);
  }
  assert.throws(() => adminDecision(source, { ...request, time: source.time }, now), error => error.status === 400);
});
test("관리자 프로그램 변경 API는 저장된 상품·금액을 반환하고 버전 충돌을 차단", async () => {
  const db = new MemoryDb();
  const source = { ...original, ...futureSlot(), productId: "sohn-stretch", price: 70000, duration: 50, intake };
  await db.save("bookings", source.id, source);
  const record = await db.get("bookings", source.id);
  const input = { id: record.id, version: record.version, action: "reschedule", date: record.date, time: record.time,
    productId: "yun-maternity", price: 1 };
  const dependencies = { db, verifyAdmin: async () => "program-admin" };
  assert.equal((await handle(req("admin/decide", { ...input, productId: "fake" }), env, dependencies)).status, 400);
  assert.equal((await db.get("bookings", source.id)).productId, "sohn-stretch");
  assert.equal((await handle(req("admin/decide", input), env, dependencies)).status, 200);
  assert.equal((await handle(req("admin/decide", input), env, dependencies)).status, 409);
  const list = await (await handle(req("admin/list", {}), env, dependencies)).json();
  assert.equal(list.records[0].productId, "yun-maternity");
  assert.equal(list.records[0].price, 50000); assert.equal(list.records[0].updatedBy, "program-admin");
  assert.deepEqual(list.records[0].intake, intake);
});


test("고객 조회는 저장된 상품 금액·소요시간만 공개하고 상담 및 내부 정보는 제외", () => {
  const record = { ...original, productId: "sohn-exercise", price: 65000, duration: 80,
    intake, healthConsent: true, updatedBy: "private-admin", internalNote: "private-note" };
  const result = publicBooking(record);
  assert.deepEqual(result.product, { id: "sohn-exercise", trainer: "손진석 대표원장", title: "기능재활운동", price: 65000, duration: 80 });
  assert.deepEqual(Object.keys(result).sort(), ["change", "date", "id", "product", "status", "time"]);
  assert.equal(publicBooking({ ...record, price: 0 }).product.price, 0);
  const legacy = publicBooking({ ...original, productId: "retired-product" });
  assert.equal(legacy.product.price, null);
  assert.equal(legacy.product.duration, null);
  assert.equal(legacy.product.title, "프로그램 확인 필요");
});

test("관리자 변경·확정·요청 처리·종료·삭제 후 고객 재조회는 최신 저장 내용과 일치", async () => {
  const db = new MemoryDb();
  const dependencies = { db, challenge: async () => {}, verifyAdmin: async () => "lookup-test-admin", notify: async () => {} };
  const input = { ...futureSlot(), name: "테스트", phone: "01012345678", consent: true, healthConsent: true,
    intake, productId: "sohn-stretch", requestId: crypto.randomUUID() };
  assert.equal((await handle(req("create", input), env, dependencies)).status, 201);
  const lookup = async () => {
    const response = await handle(req("lookup", { phone: input.phone }), env, dependencies);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Cache-Control"), /no-store/);
    return (await response.json()).records;
  };
  const id = (await lookup())[0].id;
  const checkLatest = async () => {
    const admin = (await (await handle(req("admin/list", {}), env, dependencies)).json()).records.find(record => record.id === id);
    const customer = (await lookup())[0];
    assert.deepEqual(customer, publicBooking(admin));
    assert.equal(customer.product.price, admin.price);
    assert.equal(customer.product.duration, admin.duration);
    assert.ok(!JSON.stringify(customer).includes("birthDate"));
    assert.ok(!JSON.stringify(customer).includes("updatedBy"));
    return customer;
  };
  const decide = async (action, changes = {}) => {
    const record = await db.get("bookings", id);
    assert.equal((await handle(req("admin/decide", { id, version: record.version, action, ...changes }), env, dependencies)).status, 200);
    return checkLatest();
  };
  const changed = await decide("reschedule", { date: input.date, time: "11:00", productId: "yun-maternity" });
  assert.equal(changed.time, "11:00");
  assert.equal(changed.product.trainer, "윤수진 원장");
  assert.equal(changed.product.title, "산전/산후 산모운동");
  assert.equal(changed.product.price, 50000);
  assert.equal((await decide("confirm")).status, "confirmed");
  assert.equal((await handle(req("change", { id, phone: input.phone, type: "reschedule", date: input.date, time: "12:00" }), env, dependencies)).status, 200);
  assert.equal((await checkLatest()).change.time, "12:00");
  const approved = await decide("approve-change");
  assert.equal(approved.time, "12:00"); assert.equal(approved.change, null);
  assert.equal((await handle(req("change", { id, phone: input.phone, type: "cancel" }), env, dependencies)).status, 200);
  assert.equal((await decide("reject-change")).change, null);
  assert.equal((await handle(req("change", { id, phone: input.phone, type: "cancel" }), env, dependencies)).status, 200);
  assert.equal((await decide("approve-change")).status, "cancelled");
  // Exercise the remaining terminal states with isolated in-memory fixtures.
  let record = await db.get("bookings", id);
  await db.save("bookings", id, { ...record, status: "pending" }, record.version);
  assert.equal((await decide("decline")).status, "declined");
  record = await db.get("bookings", id);
  await db.save("bookings", id, { ...record, status: "confirmed", date: "2020-01-01" }, record.version);
  assert.equal((await decide("complete")).status, "completed");
  record = await db.get("bookings", id);
  assert.equal((await handle(req("admin/delete", { id, version: record.version }), env, dependencies)).status, 200);
  assert.deepEqual(await lookup(), []);
});
