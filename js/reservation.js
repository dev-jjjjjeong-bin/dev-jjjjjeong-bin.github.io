import { setupBirthDate } from "./booking-birth-date.js";
import { scrollToApplication } from "./booking-form-navigation.js";
import { genders, intakeGroups } from "./booking-intake.js";
import { setupPhone } from "./booking-phone.js";
import { api, statuses, node, message, setupDates, loadChallenge } from "./booking-shared.js";
import { scheduleNode, priceNode, requestNode, lookupProductSummary } from "./booking-display.js";
import { products } from "./booking-products.js";
const create = document.querySelector("#create-form");
const lookup = document.querySelector("#lookup-form");
const changeForm = document.querySelector("#change-form");
const results = document.querySelector("#lookup-results");
const dialog = document.querySelector("#change-dialog");
let config, lookupPhone = "", selected, changeType, widget = {};
const formMessage = form => form.querySelector(".form-message");
const tokens = {};
let requestId = crypto.randomUUID();
let submittedFingerprint = "";
for (const product of products) {
  const label = node("label", undefined, "product-option");
  const radio = document.createElement("input");
  radio.type = "radio"; radio.name = "productId"; radio.value = product.id; radio.required = true;
  radio.addEventListener("change", () => {
    if (radio.checked) scrollToApplication(document.querySelector("#application-info"), document.querySelector(".navbar"));
  });
  const copy = node("span", undefined, "product-copy");
  copy.append(node("span", product.trainer, "product-trainer"), node("strong", product.title, "product-title"),
    node("span", product.description, "product-description"), priceNode(product));
  label.append(radio, copy); document.querySelector("#booking-products").append(label);
}

// Keep multi-select questions accessible and require at least one answer per group.
const validateGroup = group => {
  const inputs = [...create.querySelectorAll(`input[name="${group.name}"]`)];
  inputs[0].setCustomValidity(inputs.some(input => input.checked) ? "" : "한 가지 이상 선택해 주세요.");
};
for (const [value, label] of genders) create.elements.gender.add(new Option(label, value));
setupBirthDate(create.elements.birthDate);
for (const group of intakeGroups) {
  const options = document.querySelector(`#${group.name}-options`);
  for (const [value, text] of group.choices) {
    const label = node("label", undefined, "intake-option");
    const input = document.createElement("input");
    input.type = "checkbox"; input.name = group.name; input.value = value;
    input.addEventListener("change", () => {
      if (input.checked) {
        for (const other of options.querySelectorAll("input")) {
          if (other !== input && (value === "none" || other.value === "none")) other.checked = false;
        }
      }
      validateGroup(group);
    });
    label.append(input, node("span", text)); options.append(label);
  }
  validateGroup(group);
}
const requestCount = document.querySelector("#requests-count");
const updateCount = () => { requestCount.textContent = `${create.elements.requests.value.length}/500`; };
create.elements.requests.addEventListener("input", updateCount);
create.addEventListener("reset", () => queueMicrotask(() => { intakeGroups.forEach(validateGroup); updateCount(); }));
setupPhone(create.elements.phone);
setupPhone(lookup.elements.phone);

function renderChallenge(name) {
  if (!config?.ready || !window.turnstile) return;
  tokens[name] = "";
  if (widget[name] !== undefined) { window.turnstile.reset(widget[name]); return; }
  widget[name] = window.turnstile.render(`#${name}-challenge`, {
    sitekey: config.turnstileSiteKey, size: "flexible", appearance: "interaction-only",
    callback: token => { tokens[name] = token; },
    "expired-callback": () => { tokens[name] = ""; },
    "error-callback": () => { tokens[name] = ""; },
  });
}
function clearChallenge(name) { tokens[name] = ""; if (widget[name] !== undefined) window.turnstile.reset(widget[name]); }
async function submit(form, kind, work) {
  if (!tokens[kind]) { message(formMessage(form), "확인 절차가 완료된 후 다시 눌러 주세요.", "error"); return; }
  form.querySelector("fieldset").disabled = true;
  message(formMessage(form), "처리하고 있습니다…");
  try { await work(tokens[kind]); }
  catch (error) { message(formMessage(form), error.message, "error"); }
  finally { form.querySelector("fieldset").disabled = false; clearChallenge(kind); }
}
function selectTab(kind) {
  for (const name of ["create", "lookup"]) {
    const tab = document.querySelector(`#tab-${name}`);
    tab.setAttribute("aria-selected", String(name === kind));
    tab.tabIndex = name === kind ? 0 : -1;
    document.querySelector(`#panel-${name}`).hidden = name !== kind;
  }
  renderChallenge(kind);
}
for (const kind of ["create", "lookup"]) {
  const tab = document.querySelector(`#tab-${kind}`);
  tab.addEventListener("click", () => selectTab(kind));
  tab.addEventListener("keydown", event => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? "create" : event.key === "End" ? "lookup" : kind === "create" ? "lookup" : "create";
      selectTab(next); document.querySelector(`#tab-${next}`).focus();
    }
  });
}
setupDates(create.elements.date, create.elements.time);
setupDates(changeForm.elements.date, changeForm.elements.time);
create.addEventListener("submit", event => {
  event.preventDefault();
  const formData = new FormData(create);
  const data = {
    name: formData.get("name"), phone: formData.get("phone"), productId: formData.get("productId"),
    date: formData.get("date"), time: formData.get("time"),
    intake: {
      birthDate: formData.get("birthDate").replaceAll(".", "-"), gender: formData.get("gender"),
      visitPurpose: formData.get("visitPurpose"), requests: formData.get("requests"),
      ...Object.fromEntries(intakeGroups.map(group => [group.name, formData.getAll(group.name)])),
    },
    healthConsent: create.elements.healthConsent.checked,
  };
  const fingerprint = JSON.stringify(data);
  if (fingerprint !== submittedFingerprint) { requestId = crypto.randomUUID(); submittedFingerprint = fingerprint; }
  submit(create, "create", async challenge => {
    await api("create", { ...data, consent: create.elements.consent.checked, requestId, challenge });
    create.reset();
    create.elements.time.replaceChildren(new Option("날짜를 먼저 선택해 주세요", ""));
    message(formMessage(create), "신청이 접수되었습니다. 센터에서 확인 후 연락드립니다. 확정 여부는 ‘내 예약 조회 · 변경’에서도 확인할 수 있습니다.", "success");
    requestId = crypto.randomUUID(); submittedFingerprint = "";
  });
});
lookup.addEventListener("submit", event => {
  event.preventDefault();
  const phone = lookup.elements.phone.value;
  results.replaceChildren();
  submit(lookup, "lookup", async challenge => {
    const data = await api("lookup", { phone, challenge });
    lookupPhone = phone;
    message(formMessage(lookup), data.records.length ? `${data.records.length === 100 ? "최근 " : ""}${data.records.length}건의 예약을 찾았습니다.` : "해당 번호로 접수된 예약이 없습니다.");
    for (const record of data.records) {
      const card = node("article", undefined, "booking-result");
      card.append(node("span", statuses[record.status], `status-badge ${record.status}`), scheduleNode(record), lookupProductSummary(record));
      if (record.change) card.append(requestNode(record.change));
      else if (["pending", "confirmed"].includes(record.status) && Date.parse(`${record.date}T${record.time}:00+09:00`) > Date.now()) {
        const actions = node("div", undefined, "button-row");
        for (const [type, text] of [["reschedule", "일정 변경 요청"], ["cancel", "취소 요청"]]) {
          const button = node("button", text, "booking-button secondary");
          button.type = "button"; button.addEventListener("click", () => openChange(record, type));
          actions.append(button);
        }
        card.append(actions);
      }
      results.append(card);
    }
  });
});
lookup.elements.phone.addEventListener("input", () => { results.replaceChildren(); lookupPhone = ""; message(formMessage(lookup), ""); });
function openChange(record, type) {
  selected = record; changeType = type; changeForm.reset();
  changeForm.elements.date.setCustomValidity("");
  document.querySelector("#change-title").textContent = type === "cancel" ? "예약 취소 요청" : "일정 변경 요청";
  document.querySelector("#change-schedule").hidden = type === "cancel";
  changeForm.elements.date.required = changeForm.elements.time.required = type !== "cancel";
  message(formMessage(changeForm), "");
  dialog.showModal(); document.body.style.overflow = "hidden"; renderChallenge("change");
}
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => { document.body.style.overflow = ""; });
changeForm.addEventListener("submit", event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(changeForm));
  submit(changeForm, "change", async challenge => {
    await api("change", { ...data, id: selected.id, phone: lookupPhone, type: changeType, challenge });
    dialog.close(); results.replaceChildren();
    message(formMessage(lookup), "요청을 접수했습니다. 센터 확인 전까지 기존 예약은 유지됩니다. 다시 조회하면 요청 상태를 확인할 수 있습니다.", "success");
  });
});
// Do not preserve customer details in history, localStorage or the back-forward cache.
window.addEventListener("pageshow", event => {
  if (event.persisted) { create.reset(); lookup.reset(); changeForm.reset(); results.replaceChildren(); lookupPhone = ""; }
});
try {
  config = await api("config");
  if (!config.ready) throw new Error("온라인 예약을 준비 중입니다. 예약 문의는 031-778-6535 또는 네이버를 이용해 주세요.");
  await loadChallenge();
  document.querySelector("#service-status").hidden = true;
  create.querySelector("fieldset").disabled = lookup.querySelector("fieldset").disabled = false;
  renderChallenge(document.querySelector("#tab-lookup").getAttribute("aria-selected") === "true" ? "lookup" : "create");
} catch (error) { document.querySelector("#service-status").textContent = error.message; }
