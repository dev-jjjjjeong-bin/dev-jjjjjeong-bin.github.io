import test from "node:test";
import assert from "node:assert/strict";
import { formatPhone, setupPhone } from "../js/booking-phone.js";

test("전화번호 입력·붙여넣기의 자동 하이픈", () => {
  for (const [input, expected] of [
    ["", ""], ["0", "0"], ["010", "010"], ["0101", "010-1"],
    ["0101234", "010-1234"], ["01012345678", "010-1234-5678"],
    ["010-1234-5678", "010-1234-5678"], ["+82 10 1234 5678", "010-1234-5678"],
    ["0111234567", "011-123-4567"], ["010abc12345678", "010-1234-5678"],
    ["01012345678999", "010-1234-5678"],
  ]) assert.equal(formatPhone(input), expected);
});

test("중간 수정 시 커서 유지 및 하이픈 옆에서 지우기", () => {
  const handlers = {};
  const input = {
    value: "010912345678", selectionStart: 4, selectionEnd: 4,
    addEventListener(name, fn) { handlers[name] = fn; },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    setRangeText(text, start, end) {
      this.value = this.value.slice(0, start) + text + this.value.slice(end);
      this.setSelectionRange(start + text.length, start + text.length);
    },
    dispatchEvent(event) { handlers[event.type]?.(event); },
  };
  setupPhone(input);
  handlers.input();
  assert.equal(input.value, "010-9123-4567");
  assert.equal(input.selectionStart, 5);
  input.value = "010-1234-5678"; input.setSelectionRange(4, 4);
  let prevented = false;
  handlers.beforeinput({ inputType: "deleteContentBackward", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(input.value.replace(/\D/g, ""), "0112345678");
  assert.equal(input.selectionStart, 2);
});
