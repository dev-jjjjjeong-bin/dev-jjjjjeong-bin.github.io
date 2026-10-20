import { check } from "./domain.js";
import { genders, intakeGroups } from "../js/booking-intake.js";

export function validateIntake(input, now = Date.now()) {
  check(input && typeof input === "object" && !Array.isArray(input), "상담 정보를 입력해 주세요.");
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const { birthDate, gender } = input;
  check(typeof birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(birthDate),
    "생년월일을 입력해 주세요.");
  const stamp = Date.parse(`${birthDate}T00:00:00Z`);
  check(Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === birthDate &&
    birthDate >= "1900-01-01" && birthDate <= today, "생년월일을 정확히 입력해 주세요.");
  check(genders.some(([id]) => id === gender), "성별을 선택해 주세요.");
  const result = { birthDate, gender };
  for (const group of intakeGroups) {
    const values = input[group.name];
    check(Array.isArray(values) && values.length > 0 && values.length <= group.choices.length &&
      values.every(value => group.choices.some(([id]) => id === value)) &&
      new Set(values).size === values.length, `${group.title} 한 가지 이상 선택해 주세요.`);
    check(!values.includes("none") || values.length === 1, "'없음'은 다른 항목과 함께 선택할 수 없습니다.");
    result[group.name] = [...values];
  }
  check(typeof input.visitPurpose === "string" && input.visitPurpose.trim().length > 0 &&
    input.visitPurpose.length <= 1000, "방문 목적을 1~1,000자로 입력해 주세요.");
  check(input.requests === undefined || (typeof input.requests === "string" && input.requests.length <= 500),
    "요청사항은 500자 이내로 입력해 주세요.");
  result.visitPurpose = input.visitPurpose.trim();
  result.requests = input.requests?.trim() || "";
  return result;
}
