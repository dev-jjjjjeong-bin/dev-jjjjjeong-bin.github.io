const events = {
  create: "새 예약 신청이 접수되었습니다.",
  reschedule: "예약 변경 요청이 접수되었습니다.",
  cancel: "예약 취소 요청이 접수되었습니다.",
  test: "예약 알림 연결 테스트가 완료되었습니다.",
};
export class TelegramError extends Error {
  constructor(code, retryAfter = 0) {
    super("Telegram request failed");
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

// Do not expose upstream errors: their URLs may contain the bot token.
export async function telegramCall(token, method, body, fetcher = fetch) {
  if (!/^\d+:[\w-]+$/.test(token)) throw new TelegramError("config");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) {
      throw new TelegramError(Number(result.error_code) || response.status, Number(result.parameters?.retry_after) || 0);
    }
    return result.result;
  } catch (error) {
    if (error instanceof TelegramError) throw error;
    throw new TelegramError(controller.signal.aborted ? "timeout" : "network");
  } finally { clearTimeout(timer); }
}

export function telegramMessage(event, env) {
  if (!Object.hasOwn(events, event)) throw new TelegramError("event");
  const origin = new URL(env.SITE_ORIGIN);
  const local = ["localhost", "127.0.0.1"].includes(origin.hostname);
  if (!local && origin.protocol !== "https:") throw new TelegramError("config");
  const adminUrl = new URL("/admin.html", origin).href;
  // Only the event type is sent; no customer, appointment or health information.
  return {
    chat_id: env.TELEGRAM_CHAT_ID.trim(),
    text: `${local ? "[로컬 테스트] " : ""}분당튼튼운동센터\n\n${events[event]}\n관리자 페이지에서 내용을 확인해 주세요.${local ? `\n\n컴퓨터에서 확인: ${adminUrl}` : ""}`,
    link_preview_options: { is_disabled: true },
    ...(!local ? { reply_markup: { inline_keyboard: [[{ text: "관리자 페이지 열기", url: adminUrl }]] } } : {}),
  };
}

export async function notifyTelegram(event, env, options = {}) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  if (!token && !chatId) return { status: "disabled" };
  const log = options.log || (line => console.warn(line));
  let failure = "config";
  if (token && /^-?\d+$/.test(chatId || "")) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await telegramCall(token, "sendMessage", telegramMessage(event, env), options.fetch);
        return { status: "sent" };
      } catch (error) {
        failure = error instanceof TelegramError ? error.code : "config";
        const retryable = ["network", "timeout"].includes(failure) || Number(failure) >= 500 ||
          (failure === 429 && error.retryAfter <= 2);
        if (attempt || !retryable) break;
        const delay = failure === 429 ? Math.max(1, error.retryAfter) * 1000 : 500;
        await (options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms))))(delay);
      }
    }
  }
  log(`telegram_notification_failed event=${Object.hasOwn(events, event) ? event : "unknown"} code=${failure}`);
  return { status: "failed" };
}
