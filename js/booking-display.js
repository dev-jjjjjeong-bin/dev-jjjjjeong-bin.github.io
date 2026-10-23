import { node } from "./booking-shared.js";
import { formatPhone } from "./booking-phone.js";

// Keep each date, time, amount and phone number intact while allowing rows to wrap.
export const textUnit = text => node("span", text, "booking-text-unit");
export function scheduleNode(record, tag = "h3") {
  const result = node(tag, undefined, "booking-schedule");
  result.append(textUnit(record.date.replaceAll("-", ".")), textUnit(`· ${record.time}`));
  return result;
}
export function priceNode(product) {
  const result = node("span", undefined, "product-price booking-meta-row");
  result.append(textUnit(`상담·체험 ${product.duration}분`), textUnit(`${product.price.toLocaleString("ko-KR")}원`));
  return result;
}
export function productSummary(product, price) {
  const result = node("div", undefined, "booking-product-summary");
  result.append(node("p", product.trainer, "booking-trainer"));
  const description = node("p", undefined, "booking-meta-row");
  const title = node("span", undefined, "booking-product-label");
  title.append(node("span", product.title), textUnit("(상담·체험)"));
  description.append(title, node("strong", Number.isFinite(price) ? `${price.toLocaleString("ko-KR")}원` : "금액 확인 필요", "booking-text-unit booking-amount"));
  result.append(description);
  return result;
}
export function lookupProductSummary(record) {
  const product = record.product ?? { trainer: "담당 원장 확인 필요", title: "프로그램 확인 필요" };
  const result = productSummary(product, product.price);
  result.append(node("p", Number.isFinite(product.duration) && product.duration > 0
    ? `상담·체험 ${product.duration}분` : "소요시간 확인 필요", "field-help booking-text-unit"));
  return result;
}
export function contactNode(record) {
  const result = node("p", undefined, "booking-contact booking-meta-row");
  const phone = node("a", formatPhone(record.phone), "booking-text-unit");
  phone.href = `tel:${record.phone}`;
  result.append(node("span", record.name), phone);
  return result;
}
export function requestNode(change, admin = false) {
  const result = node("p", undefined, "request-note");
  if (change.type === "cancel") {
    result.textContent = admin ? "고객 요청: 예약 취소" : "취소 요청 확인 중 · 기존 예약은 유지됩니다.";
  } else {
    result.append(node("span", admin ? "고객 일정 변경 요청" : "변경 요청 확인 중"), scheduleNode(change, "span"));
  }
  return result;
}
