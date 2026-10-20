export async function api(path, data, token) {
  const response = await fetch(`/api/booking/${path}`, {
    method: data === undefined ? "GET" : "POST", cache: "no-store", credentials: "omit",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  let result;
  try { result = await response.json(); } catch { throw new Error("온라인 예약을 준비 중입니다. 031-778-6535로 문의해 주세요."); }
  if (!response.ok) throw new Error(result.error || "연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return result;
}
export const statuses = { pending:"확인 대기", confirmed:"예약 확정", declined:"예약 불가", cancelled:"취소 완료", completed:"이용 완료" };
export function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
export function message(target, text, type = "") {
  target.textContent = text;
  target.className = `form-message ${type}`;
}
export function scheduleLabel(record) { return `${record.date.replaceAll("-", ".")} · ${record.time}`; }
export function setupDates(date, time) {
  const koreaDate = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  date.min = koreaDate;
  date.max = new Date(Date.now() + 89 * 86400000 + 9 * 3600000).toISOString().slice(0, 10);
  date.addEventListener("change", () => {
    date.setCustomValidity("");
    time.replaceChildren(new Option("시간 선택", ""));
    if (!date.value) return;
    const weekday = new Date(`${date.value}T12:00:00+09:00`).getUTCDay();
    if (weekday === 0) {
      date.setCustomValidity("일요일은 휴무입니다. 다른 날짜를 선택해 주세요.");
      date.reportValidity(); return;
    }
    date.setCustomValidity("");
    for (let minutes = 540; minutes <= (weekday === 6 ? 720 : 1200); minutes += 60) {
      const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
      if (Date.parse(`${date.value}T${value}:00+09:00`) > Date.now()) time.add(new Option(value, value));
    }
  });
}
export async function loadChallenge() {
  if (window.turnstile) return;
  await new Promise((resolve, reject) => {
    window.bookingChallengeReady = resolve;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=bookingChallengeReady&render=explicit";
    script.async = true; script.onerror = () => reject(new Error("확인 화면을 불러오지 못했습니다. 새로고침해 주세요."));
    document.head.append(script);
  });
}
