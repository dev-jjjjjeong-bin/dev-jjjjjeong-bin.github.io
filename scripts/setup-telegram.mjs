import { readFile, writeFile, chmod } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { randomBytes } from "node:crypto";
import { telegramCall, notifyTelegram, TelegramError } from "../server/telegram.js";

// Run locally in the VS Code terminal. Never print the token or put it in a URL.
const file = new URL("../.booking-local.json", import.meta.url);
let muted = false;
const output = new Writable({ write(chunk, _encoding, done) {
  if (!muted) process.stdout.write(chunk);
  done();
} });
const rl = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
try {
  if (!process.stdin.isTTY) throw new Error("VS Code의 터미널에서 직접 실행해 주세요.");
  const config = JSON.parse(await readFile(file, "utf8"));
  console.log("BotFather에서 받은 봇 토큰을 입력하세요. 입력 내용은 화면에 표시되지 않습니다.");
  const answer = rl.question("봇 토큰: ");
  muted = true;
  const token = (await answer).trim();
  muted = false; console.log("");
  const bot = await telegramCall(token, "getMe", {});
  const code = `센터예약연결-${randomBytes(4).toString("hex")}`;
  console.log(`\n텔레그램에서 https://t.me/${bot.username} 를 열고 ‘시작’을 누르세요.`);
  console.log(`이 봇과의 개인 대화에 다음 문구를 그대로 보내세요:\n\n${code}\n`);
  await rl.question("전송했다면 Enter를 눌러 주세요: ");
  const updates = await telegramCall(token, "getUpdates", { limit: 100, timeout: 0, allowed_updates: ["message"] });
  const matches = updates.filter(update => update.message?.chat?.type === "private" && update.message.text === code);
  const chats = new Map(matches.map(update => [String(update.message.chat.id), update.message.chat]));
  if (chats.size !== 1) throw new Error("연결 문구를 확인하지 못했습니다. 새 봇의 개인 대화에 문구를 보내고 다시 실행해 주세요.");
  const [chatId, chat] = [...chats][0];
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(" ").replace(/[\r\n\x00-\x1f]/g, "");
  console.log(`\n알림 수신 계정: ${name || "개인 계정"} / Chat ID: ${chatId}`);
  if ((await rl.question("이 계정으로 테스트 알림을 보내고 연결할까요? (y/N): ")).trim().toLowerCase() !== "y") {
    console.log("설정을 변경하지 않았습니다.");
  } else {
    const result = await notifyTelegram("test", {
      TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId, SITE_ORIGIN: "http://localhost:8790",
    });
    if (result.status !== "sent") throw new Error("테스트 알림 전송에 실패했습니다. 봇을 차단했는지 확인해 주세요.");
    // Preserve the Firebase settings and refuse to overwrite changes made during setup.
    const latest = JSON.parse(await readFile(file, "utf8"));
    latest.telegramBotToken = token;
    latest.telegramChatId = chatId;
    await chmod(file, 0o600);
    await writeFile(file, JSON.stringify(latest, null, 2) + "\n", { mode: 0o600 });
    console.log("\n연결 완료! 토큰과 Chat ID를 .booking-local.json에 저장했습니다.");
    console.log("로컬 서버를 재시작하세요. 운영 연결은 docs/telegram-setup.md를 따라 Cloudflare Secret 두 개를 등록하세요.");
  }
} catch (error) {
  muted = false;
  if (error instanceof TelegramError) {
    const hints = { 401: "봇 토큰을 다시 확인해 주세요.", 403: "봇을 차단 해제하고 시작을 눌러 주세요.",
      409: "다른 프로그램에서 사용 중인 봇입니다. 예약 알림용 새 봇을 만들어 주세요.",
      config: "봇 토큰 형식이 올바르지 않습니다." };
    console.error(`연결 실패: ${hints[error.code] || "인터넷 연결 또는 텔레그램 상태를 확인하고 다시 실행해 주세요."}`);
  } else if (error.code === "ENOENT") {
    console.error(".booking-local.json이 없습니다. 기존 예약 로컬 설정부터 완료해 주세요.");
  } else {
    console.error(error instanceof SyntaxError ? "로컬 설정 파일의 JSON 형식을 확인해 주세요." :
      error.code ? "로컬 설정 파일을 읽거나 저장하지 못했습니다." : error.message);
  }
  process.exitCode = 1;
} finally { rl.close(); }
