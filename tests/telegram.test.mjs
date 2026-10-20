import test from "node:test";
import assert from "node:assert/strict";
import { notifyTelegram, telegramMessage, telegramCall } from "../server/telegram.js";

const env = { TELEGRAM_BOT_TOKEN: "123456:private-token", TELEGRAM_CHAT_ID: "12345", SITE_ORIGIN: "https://example.test" };
test("세 가지 요청 알림과 관리자 링크; 로컬 링크는 컴퓨터 안내로 구분", () => {
  for (const [event, text] of [["create", "새 예약 신청"], ["reschedule", "예약 변경 요청"], ["cancel", "예약 취소 요청"]]) {
    const body = telegramMessage(event, env);
    assert.ok(body.text.includes(text));
    assert.equal(body.chat_id, env.TELEGRAM_CHAT_ID);
    assert.equal(body.reply_markup.inline_keyboard[0][0].url, "https://example.test/admin.html");
    assert.equal(body.link_preview_options.is_disabled, true);
    assert.ok(!JSON.stringify(body).includes(env.TELEGRAM_BOT_TOKEN));
  }
  const local = telegramMessage("test", { ...env, SITE_ORIGIN: "http://localhost:8790" });
  assert.match(local.text, /로컬 테스트/);
  assert.match(local.text, /컴퓨터에서 확인: http:\/\/localhost:8790\/admin.html/);
  assert.equal(local.reply_markup, undefined);
});
test("선택 설정: 미설정은 발송하지 않으며 잘못된 설정은 안전하게 실패", async () => {
  let calls = 0; const logs = [];
  const options = { fetch: async () => { calls++; }, log: message => logs.push(message) };
  assert.equal((await notifyTelegram("create", {}, options)).status, "disabled");
  assert.equal((await notifyTelegram("create", { TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN }, options)).status, "failed");
  assert.equal(calls, 0);
  assert.equal(logs.length, 1);
  assert.ok(!logs[0].includes(env.TELEGRAM_BOT_TOKEN));
});
test("성공 응답을 확인하고 일시 오류만 한 번 재시도", async () => {
  let calls = 0;
  const sleeps = [];
  assert.equal((await notifyTelegram("create", env, {
    fetch: async (_url, options) => {
      calls++;
      assert.ok(options.signal);
      const body = JSON.parse(options.body);
      assert.deepEqual(Object.keys(body).sort(), ["chat_id", "link_preview_options", "reply_markup", "text"]);
      return calls === 1 ? Response.json({ ok: false, error_code: 429, parameters: { retry_after: 2 } }, { status: 429 }) :
        Response.json({ ok: true, result: { message_id: 1 } });
    }, sleep: async ms => sleeps.push(ms),
  })).status, "sent");
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [2000]);
});
test("영구 오류는 재시도하지 않고 상위 오류와 토큰을 로그에서 제외", async () => {
  const logs = []; let calls = 0;
  const result = await notifyTelegram("cancel", env, {
    fetch: async () => { calls++; return Response.json({ ok: false, error_code: 403, description: env.TELEGRAM_BOT_TOKEN }, { status: 403 }); },
    log: message => logs.push(message),
  });
  assert.equal(result.status, "failed"); assert.equal(calls, 1);
  assert.deepEqual(logs, ["telegram_notification_failed event=cancel code=403"]);
});
test("네트워크 실패는 두 번까지만 시도하고 비밀값을 노출하지 않음", async () => {
  let calls = 0; const logs = [];
  const result = await notifyTelegram("reschedule", env, {
    fetch: async () => { calls++; throw new Error(`failed https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`); },
    sleep: async () => {}, log: message => logs.push(message),
  });
  assert.equal(result.status, "failed"); assert.equal(calls, 2);
  assert.equal(logs.length, 1); assert.ok(!logs[0].includes(env.TELEGRAM_BOT_TOKEN));
  await assert.rejects(telegramCall(env.TELEGRAM_BOT_TOKEN, "getMe", {}, async () => { throw new Error(env.TELEGRAM_BOT_TOKEN); }),
    error => error.message === "Telegram request failed" && error.code === "network");
});
