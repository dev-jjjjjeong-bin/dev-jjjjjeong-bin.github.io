export function formatPhone(value) {
  let digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("82")) digits = "0" + digits.slice(2);
  digits = digits.slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  const middle = digits.length === 10 ? 6 : 7;
  return `${digits.slice(0, 3)}-${digits.slice(3, middle)}-${digits.slice(middle)}`;
}
export function setupPhone(input) {
  const format = () => {
    const before = input.value;
    const cursor = input.selectionStart ?? before.length;
    let digitsBefore = before.slice(0, cursor).replace(/\D/g, "").length;
    if (before.replace(/\D/g, "").startsWith("82")) digitsBefore = Math.max(0, digitsBefore - 1);
    input.value = formatPhone(before);
    let position = 0, count = 0;
    while (position < input.value.length && count < digitsBefore) {
      if (/\d/.test(input.value[position])) count++;
      position++;
    }
    if (cursor === before.length) position = input.value.length;
    input.setSelectionRange(position, position);
  };
  input.addEventListener("input", format);
  input.addEventListener("beforeinput", event => {
    const start = input.selectionStart, end = input.selectionEnd;
    if (start !== end || start === null) return;
    const backward = event.inputType === "deleteContentBackward";
    const forward = event.inputType === "deleteContentForward";
    if (backward && input.value[start - 1] === "-") {
      event.preventDefault();
      input.setRangeText("", Math.max(0, start - 2), start, "end");
    } else if (forward && input.value[start] === "-") {
      event.preventDefault();
      input.setRangeText("", start, start + 2, "start");
    } else return;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  input.addEventListener("blur", format);
}
