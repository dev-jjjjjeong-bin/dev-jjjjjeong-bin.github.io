import test from "node:test";
import assert from "node:assert/strict";
import { formatBirthDate, birthDateError, setupBirthDate } from "../js/booking-birth-date.js";
import { scrollToApplication } from "../js/booking-form-navigation.js";
import { genders, intakeRows } from "../js/booking-intake.js";
import { validateIntake } from "../server/intake.js";

const now = Date.parse("2026-10-21T15:30:00Z");
test("생년월일 숫자 입력·붙여넣기·자동완성을 점 형식으로 정리", () => {
  for (const [input, output] of [["", ""], ["1990", "1990"], ["19900", "1990.0"],
    ["199005", "1990.05"], ["1990051", "1990.05.1"], ["19900512", "1990.05.12"],
    ["1990-05-12", "1990.05.12"], ["1990.05.12", "1990.05.12"], ["１９９００５１２", "1990.05.12"],
    ["199005129999", "1990.05.12"]]) assert.equal(formatBirthDate(input), output);
});
test("윤년·없는 날짜·미래·최소 연도·한국 날짜 경계 검증", () => {
  for (const value of ["", "1900.01.01", "2000.02.29", "2026.10.22"]) assert.equal(birthDateError(value, now), "");
  for (const value of ["1990", "1990.05.1", "1900.02.29", "2025.02.29", "2026.04.31", "2026.13.01", "1899.12.31", "2026.10.23"]) {
    assert.notEqual(birthDateError(value, now), "", value);
  }
});
test("구분자 옆 삭제·커서 위치·수정 후 오류 해제·폼 초기화", () => {
  const handlers = {}, formHandlers = {};
  const input = {
    value: "", selectionStart: 0, selectionEnd: 0, validity: "",
    form: { addEventListener(name, fn) { formHandlers[name] = fn; } },
    addEventListener(name, fn) { handlers[name] = fn; },
    setCustomValidity(value) { this.validity = value; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    setRangeText(text, start, end) {
      this.value = this.value.slice(0, start) + text + this.value.slice(end);
      this.setSelectionRange(start + text.length, start + text.length);
    },
    dispatchEvent(event) { handlers[event.type]?.(event); },
  };
  setupBirthDate(input);
  input.value = "19900512"; input.setSelectionRange(8, 8); handlers.input();
  assert.equal(input.value, "1990.05.12"); assert.equal(input.selectionStart, 10); assert.equal(input.validity, "");
  input.setSelectionRange(5, 5);
  let prevented = false;
  handlers.beforeinput({ inputType: "deleteContentBackward", preventDefault() { prevented = true; } });
  assert.ok(prevented); assert.equal(input.value.replace(/\D/g, ""), "1990512"); assert.equal(input.selectionStart, 3);
  input.value = "1990.05.12"; input.setSelectionRange(7, 7);
  handlers.beforeinput({ inputType: "deleteContentForward", preventDefault() {} });
  assert.equal(input.value, "1990.05.2"); assert.equal(input.selectionStart, 7);
  input.value = "20250229"; input.setSelectionRange(8, 8); handlers.input(); assert.notEqual(input.validity, "");
  input.value = "20000229"; input.setSelectionRange(8, 8); handlers.input(); assert.equal(input.validity, "");
  input.value = "1990"; handlers.input(); assert.notEqual(input.validity, "");
  formHandlers.reset(); assert.equal(input.validity, "");
});
test("성별 기타는 신규 접수에서 제외하되 기존 기록 표시 유지", () => {
  assert.deepEqual(genders.map(([value]) => value), ["male", "female"]);
  assert.equal(intakeRows({ gender: "other" }).find(([label]) => label === "성별")[1], "기타");
  const intake = { birthDate: formatBirthDate("19900512").replaceAll(".", "-"), gender: "male", referralSources: ["search"],
    treatmentHistory: ["none"], exerciseHistory: ["none"], visitPurpose: "운동 상담" };
  assert.equal(validateIntake(intake, now).birthDate, "1990-05-12");
  assert.throws(() => validateIntake({ ...intake, gender: "other" }, now));
});
test("상단 메뉴 실제 높이를 반영하고 동작 줄이기 설정을 존중", () => {
  for (const [position, height, reduced, offset, behavior] of [
    ["sticky", 110, false, "126px", "smooth"], ["sticky", 132, true, "148px", "instant"],
    ["static", 110, false, "16px", "smooth"],
  ]) {
    const calls = []; const heading = { style: {}, focus: options => calls.push(options), scrollIntoView: options => calls.push(options) };
    scrollToApplication(heading, { getBoundingClientRect: () => ({ height }) }, {
      getComputedStyle: () => ({ position }), matchMedia: () => ({ matches: reduced }),
    });
    assert.equal(heading.style.scrollMarginTop, offset);
    assert.deepEqual(calls, [{ preventScroll: true }, { behavior, block: "start" }]);
  }
});
