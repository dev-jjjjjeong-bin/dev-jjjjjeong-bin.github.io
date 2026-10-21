export function formatBirthDate(value) {
  const digits = String(value).normalize("NFKC").replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join(".");
}
export function birthDateError(value, now = Date.now()) {
  if (!value) return ""; // The required attribute handles an empty field.
  if (!/^\d{4}\.\d{2}\.\d{2}$/.test(value)) return "생년월일을 숫자 8자리로 입력해 주세요. 예: 19900512";
  const iso = value.replaceAll(".", "-");
  const stamp = Date.parse(`${iso}T00:00:00Z`);
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== iso || iso < "1900-01-01" || iso > today) {
    return "생년월일을 정확히 입력해 주세요.";
  }
  return "";
}
export function setupBirthDate(input) {
  const format = () => {
    const before = input.value;
    const cursor = input.selectionStart ?? before.length;
    const digitsBefore = before.slice(0, cursor).normalize("NFKC").replace(/\D/g, "").length;
    input.value = formatBirthDate(before);
    let position = 0, count = 0;
    while (position < input.value.length && count < digitsBefore) {
      if (/\d/.test(input.value[position])) count++;
      position++;
    }
    if (cursor === before.length) position = input.value.length;
    input.setSelectionRange(position, position);
    input.setCustomValidity(birthDateError(input.value));
  };
  input.addEventListener("input", format);
  input.addEventListener("blur", format);
  input.addEventListener("beforeinput", event => {
    const start = input.selectionStart, end = input.selectionEnd;
    if (start !== end || start === null) return;
    if (event.inputType === "deleteContentBackward" && input.value[start - 1] === ".") {
      event.preventDefault();
      input.setRangeText("", Math.max(0, start - 2), start, "end");
    } else if (event.inputType === "deleteContentForward" && input.value[start] === ".") {
      event.preventDefault();
      input.setRangeText("", start, start + 2, "start");
    } else return;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  input.form?.addEventListener("reset", () => input.setCustomValidity(""));
  format();
}
