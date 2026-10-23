import { products } from "./booking-products.js";
import { productSummary } from "./booking-display.js";
import { node, message, scheduleLabel, setupDates, statuses } from "./booking-shared.js";

// A card-local editor: saving changes the schedule and product, not the booking status.
export function createRescheduleEditor(record, save) {
  const button = node("button", "예약 변경", "booking-button secondary");
  button.type = "button";
  const form = node("form", undefined, "admin-reschedule");
  form.id = `reschedule-${record.id}`;
  form.hidden = true;
  button.setAttribute("aria-controls", form.id);
  button.setAttribute("aria-expanded", "false");
  const heading = node("h3", "예약 내용 변경");
  heading.id = `${form.id}-heading`;
  form.setAttribute("aria-labelledby", heading.id);
  form.append(heading, node("p", `현재 예약: ${scheduleLabel(record)}`, "field-help"));
  const fields = node("fieldset");
  const productSelect = node("select");
  productSelect.name = "productId"; productSelect.required = true;
  productSelect.id = `${form.id}-product`;
  const productCaption = node("label", "변경할 프로그램"); productCaption.htmlFor = productSelect.id;
  productSelect.add(new Option("프로그램 선택", ""));
  for (const product of products) {
    productSelect.add(new Option(`${product.trainer} · ${product.title}`, product.id));
  }
  const productDetails = node("div", undefined, "admin-reschedule-product");
  productDetails.setAttribute("aria-live", "polite");
  const row = node("div", undefined, "field-row");
  const date = node("input"), time = node("select");
  date.type = "date"; date.name = "date"; date.required = true;
  time.name = "time"; time.required = true;
  for (const [name, label, input] of [["date", "변경할 날짜", date], ["time", "변경할 시간", time]]) {
    const group = node("div"), caption = node("label", label);
    input.id = `${form.id}-${name}`; caption.htmlFor = input.id;
    group.append(caption, input); row.append(group);
  }
  setupDates(date, time);
  const summary = node("p", "", "admin-reschedule-summary");
  summary.setAttribute("aria-live", "polite");
  const confirmation = node("label", undefined, "checkbox-label");
  const agreed = node("input"); agreed.type = "checkbox"; agreed.required = true;
  confirmation.append(agreed, node("span", "고객과 변경할 프로그램·일시·금액을 확인했습니다."));
  const feedback = node("p", "", "form-message");
  feedback.setAttribute("role", "status");
  const actions = node("div", undefined, "button-row");
  const submit = node("button", "변경 저장", "booking-button primary"); submit.type = "submit";
  const cancel = node("button", "닫기", "booking-button secondary"); cancel.type = "button";
  actions.append(submit, cancel);
  fields.append(productCaption, productSelect, productDetails, row, summary, node("p", `저장 후에도 ‘${statuses[record.status]}’ 상태가 유지됩니다. 고객에게 변경 내용을 안내해 주세요.`, "field-help"), confirmation, feedback, actions);
  form.append(fields);
  function update() {
    agreed.checked = false;
    message(feedback, "");
    productDetails.replaceChildren();
    const selected = products.find(product => product.id === productSelect.value);
    if (selected) {
      const price = selected.id === record.productId ? record.price : selected.price;
      productDetails.append(productSummary(selected, price));
      const duration = selected.id === record.productId ? (record.duration ?? selected.duration) : selected.duration;
      productDetails.append(node("p", `상담·체험 ${duration}분`, "field-help"));
    }
    summary.textContent = date.value && time.value ? `변경할 예약: ${scheduleLabel({ date: date.value, time: time.value })}` : "변경할 날짜와 시간을 선택해 주세요.";
  }
  productSelect.addEventListener("change", update);
  date.addEventListener("change", update);
  time.addEventListener("change", update);
  function close() {
    form.hidden = true; button.setAttribute("aria-expanded", "false"); button.focus();
  }
  button.addEventListener("click", () => {
    if (!form.hidden) { close(); return; }
    productSelect.value = record.productId || "";
    date.value = record.date;
    date.dispatchEvent(new Event("change"));
    time.value = record.time;
    update();
    form.hidden = false; button.setAttribute("aria-expanded", "true"); productSelect.focus();
  });
  cancel.addEventListener("click", close);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (fields.disabled || !form.reportValidity()) return;
    if (date.value === record.date && time.value === record.time && productSelect.value === record.productId) {
      message(feedback, "변경할 일시 또는 프로그램을 선택해 주세요.", "error"); return;
    }
    fields.disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      await save({ date: date.value, time: time.value, productId: productSelect.value }, feedback);
    } catch (error) {
      message(feedback, error.message, "error");
    } finally {
      fields.disabled = false; form.removeAttribute("aria-busy");
    }
  });
  return { button, form };
}
