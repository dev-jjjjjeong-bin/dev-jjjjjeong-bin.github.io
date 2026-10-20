export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function check(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
export function phoneNumber(value) {
  check(typeof value === "string" && value.length <= 30, "전화번호를 확인해 주세요.");
  const phone = value.replace(/[\s()-]/g, "").replace(/^\+82/, "0");
  check(/^(?:010\d{8}|01[16789]\d{7,8})$/.test(phone), "전화번호를 정확히 입력해 주세요.");
  return phone;
}
export function appointment(input, now = Date.now()) {
  const { date, time } = input;
  check(typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date), "희망 날짜를 선택해 주세요.");
  check(typeof time === "string" && /^\d{2}:00$/.test(time), "희망 시간을 선택해 주세요.");
  const stamp = Date.parse(`${date}T${time}:00+09:00`);
  check(Number.isFinite(stamp) && new Date(stamp + 9 * 3600000).toISOString().slice(0, 10) === date,
    "날짜를 확인해 주세요.");
  check(stamp > now && stamp <= now + 90 * 86400000, "지금 이후부터 90일 이내의 날짜를 선택해 주세요.");
  const weekday = new Date(`${date}T12:00:00+09:00`).getUTCDay();
  check(weekday !== 0, "일요일은 휴무입니다.");
  check(time >= "09:00" && time <= (weekday === 6 ? "12:00" : "20:00"), "운영시간 내의 시간을 선택해 주세요.");
  return { date, time };
}
export function publicBooking(record) {
  // Phone-only lookup must never serialize the complete stored document.
  return {
    id: record.id, date: record.date, time: record.time, status: record.status,
    change: record.change ? {
      type: record.change.type, date: record.change.date ?? null, time: record.change.time ?? null,
    } : null,
  };
}
export function requestChange(record, input, now = Date.now()) {
  check(["pending", "confirmed"].includes(record.status), "현재 상태에서는 변경할 수 없습니다.", 409);
  check(Date.parse(`${record.date}T${record.time}:00+09:00`) > now, "지난 예약은 센터로 문의해 주세요.", 409);
  check(!record.change, "이미 확인 중인 요청이 있습니다. 센터로 문의해 주세요.", 409);
  check(["reschedule", "cancel"].includes(input.type), "요청 종류를 확인해 주세요.");
  if (input.type === "cancel") check(record.date > new Date(now + 9 * 3600000).toISOString().slice(0, 10),
    "당일 취소는 불가합니다. 센터로 직접 문의해 주세요.");
  const change = { type: input.type, requestedAt: new Date(now).toISOString() };
  if (input.type === "reschedule") {
    Object.assign(change, appointment(input, now));
    check(change.date !== record.date || change.time !== record.time, "다른 일시를 선택해 주세요.");
  }
  return { ...record, change };
}
export function adminDecision(record, input, now = Date.now()) {
  const next = { ...record };
  switch (input.action) {
    case "confirm":
      check(record.status === "pending" && !record.change, "먼저 변경 요청을 처리해 주세요.", 409);
      appointment(record, now);
      next.status = "confirmed";
      break;
    case "decline":
      check(record.status === "pending" && !record.change, "현재 상태에서는 거절할 수 없습니다.", 409);
      next.status = "declined";
      break;
    case "approve-change":
      check(record.change && ["pending", "confirmed"].includes(record.status), "처리할 요청이 없습니다.", 409);
      if (record.change.type === "cancel") next.status = "cancelled";
      else Object.assign(next, appointment(record.change, now));
      next.change = null;
      break;
    case "reject-change":
      check(record.change, "처리할 요청이 없습니다.", 409);
      next.change = null;
      break;
    case "complete":
      check(record.status === "confirmed" && !record.change, "확정된 예약만 완료할 수 있습니다.", 409);
      check(Date.parse(`${record.date}T${record.time}:00+09:00`) <= now, "예약 시간이 지난 후 완료할 수 있습니다.");
      next.status = "completed";
      break;
    default: throw new HttpError(400, "처리 방법을 확인해 주세요.");
  }
  return next;
}
