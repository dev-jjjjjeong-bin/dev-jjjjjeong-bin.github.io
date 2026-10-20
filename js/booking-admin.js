import { api, node, message, statuses, scheduleLabel } from "./booking-shared.js";
import { products, productLabel } from "./booking-products.js";
const output = document.querySelector("#admin-records");
const notice = document.querySelector("#admin-message");
const login = document.querySelector("#login-button");
const workspace = document.querySelector("#admin-workspace");
let auth, authModule, records = [], next, busy = false, generation = 0;
async function adminApi(path, data = {}) {
  if (!auth.currentUser) throw new Error("다시 로그인해 주세요.");
  return api(`admin/${path}`, data, await auth.currentUser.getIdToken());
}
async function refresh(append = false) {
  const currentGeneration = generation;
  const data = await adminApi("list", append ? { after: next } : {});
  if (generation !== currentGeneration || !auth.currentUser) return;
  records = append ? [...records, ...data.records] : data.records; next = data.next;
  workspace.hidden = false; document.querySelector("#admin-login").hidden = true;
  document.querySelector("#more-button").hidden = !next;
  render(); message(notice, `${records.length}건을 불러왔습니다.`);
}
function render() {
  output.replaceChildren();
  const filter = document.querySelector("#status-filter").value;
  const visible = records.filter(r => filter === "all" || (filter === "change" ? r.change : filter === "closed" ? ["completed","cancelled","declined"].includes(r.status) : r.status === filter));
  if (!visible.length) output.append(node("p", "해당하는 예약이 없습니다."));
  for (const record of visible) {
    const card = node("article", undefined, "booking-result");
    card.append(node("span", statuses[record.status], `status-badge ${record.status}`), node("h3", scheduleLabel(record)));
    const product = products.find(p => p.id === record.productId);
    if (product) card.append(node("p", `${productLabel(product)} · ${record.price.toLocaleString("ko-KR")}원`));
    const contact = node("p", `${record.name} · `);
    const phone = node("a", record.phone); phone.href = `tel:${record.phone}`; contact.append(phone); card.append(contact);
    card.append(node("p", `신청: ${new Date(record.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`, "field-help"));
    const actions = node("div", undefined, "button-row");
    let options = [];
    if (record.change) {
      card.append(node("p", record.change.type === "cancel" ? "고객 요청: 예약 취소" : `고객 요청: ${scheduleLabel(record.change)}로 변경`, "request-note"));
      options = [["approve-change","요청 승인"],["reject-change","요청 거절"]];
    } else if (record.status === "pending") options = [["confirm","예약 확정"],["decline","예약 불가"]];
    else if (record.status === "confirmed") options = [["complete","이용 완료"]];
    else options = [["delete","개인정보 삭제"]];
    for (const [action, label] of options) {
      const button = node("button", label, "booking-button secondary");
      button.type = "button";
      button.addEventListener("click", () => perform(async () => {
        if (!window.confirm(action === "delete" ? "이 예약과 개인정보를 영구 삭제할까요?" : `고객에게 직접 확인하셨나요? '${label}' 처리합니다.`)) return;
        await adminApi(action === "delete" ? "delete" : "decide", { id: record.id, version: record.version, action });
        await refresh(); message(notice, `${label} 처리가 완료되었습니다.`, "success");
      }));
      actions.append(button);
    }
    card.append(actions); output.append(card);
  }
}
async function perform(work) {
  if (busy) return;
  busy = true;
  workspace.querySelectorAll("button").forEach(button => { button.disabled = true; });
  try { await work(); } catch (error) { message(notice, error.message, "error"); }
  finally { busy = false; workspace.querySelectorAll("button").forEach(button => { button.disabled = false; }); }
}
document.querySelector("#status-filter").addEventListener("change", render);
document.querySelector("#refresh-button").addEventListener("click", () => perform(() => refresh()));
document.querySelector("#more-button").addEventListener("click", () => perform(() => refresh(true)));
const loginPanel = document.querySelector("#admin-login");
const loginForm = document.querySelector("#admin-login-form");
const email = document.querySelector("#admin-email");
const password = document.querySelector("#admin-password");
const account = document.querySelector("#admin-account");
const verification = document.querySelector("#admin-verification");
let authBusy = false;
function authError(error) {
  if (error.code === "auth/too-many-requests") return "요청이 많습니다. 잠시 후 다시 시도해 주세요.";
  if (error.code === "auth/network-request-failed") return "인터넷 연결을 확인하고 다시 시도해 주세요.";
  if (error.code === "auth/operation-not-allowed") return "이메일 로그인이 아직 설정되지 않았습니다. 관리자 설정 안내를 확인해 주세요.";
  return "로그인하지 못했습니다. 이메일과 비밀번호를 확인해 주세요.";
}
async function authAction(work) {
  if (authBusy || !auth) return;
  authBusy = true;
  loginPanel.setAttribute("aria-busy", "true");
  loginPanel.querySelectorAll("button, input").forEach(element => { element.disabled = true; });
  try { await work(); }
  catch (error) { message(notice, authError(error), "error"); }
  finally {
    authBusy = false;
    loginPanel.removeAttribute("aria-busy");
    loginPanel.querySelectorAll("button, input").forEach(element => { element.disabled = false; });
  }
}
async function openAccount(user) {
  const currentGeneration = generation;
  loginForm.hidden = true; account.hidden = false;
  document.querySelector("#admin-account-email").textContent = user.email;
  verification.hidden = user.emailVerified;
  if (!user.emailVerified) {
    message(notice, "확인 메일을 받아 이메일 주소를 확인해 주세요.");
    return;
  }
  message(notice, "관리자 권한을 확인하고 있습니다.");
  try { await refresh(); }
  catch (error) {
    if (generation === currentGeneration) message(notice, error.message, "error");
  }
}
loginForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;
  authAction(async () => {
    message(notice, "로그인 중입니다.");
    try { await authModule.signInWithEmailAndPassword(auth, email.value.trim(), password.value); }
    finally { password.value = ""; }
  });
});
document.querySelector("#reset-password-button").addEventListener("click", () => {
  if (!email.reportValidity()) return;
  authAction(async () => {
    try { await authModule.sendPasswordResetEmail(auth, email.value.trim()); }
    catch (error) {
      // Do not disclose whether an email address has an account.
      if (error.code !== "auth/user-not-found") {
        if (["auth/network-request-failed", "auth/too-many-requests"].includes(error.code)) throw error;
        message(notice, "재설정 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
        return;
      }
    }
    message(notice, "등록된 이메일이라면 비밀번호 재설정 메일이 발송됩니다. 받은편지함과 스팸함을 확인해 주세요.", "success");
  });
});
document.querySelector("#verify-email-button").addEventListener("click", () => authAction(async () => {
  try { await authModule.sendEmailVerification(auth.currentUser); }
  catch (error) {
    if (["auth/network-request-failed", "auth/too-many-requests"].includes(error.code)) throw error;
    message(notice, "확인 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
    return;
  }
  message(notice, "확인 메일을 보냈습니다. 받은편지함과 스팸함을 확인해 주세요.", "success");
}));
document.querySelector("#check-email-button").addEventListener("click", () => authAction(async () => {
  const user = auth.currentUser;
  await authModule.reload(user);
  if (!user.emailVerified) {
    message(notice, "아직 이메일 확인이 완료되지 않았습니다. 메일의 확인 링크를 눌러 주세요.", "error");
    return;
  }
  await user.getIdToken(true);
  await openAccount(user);
}));
for (const id of ["logout-button", "switch-account-button"]) {
  document.querySelector(`#${id}`).addEventListener("click", () => authAction(() => authModule.signOut(auth)));
}
try {
  const config = await api("config");
  if (!config.ready) throw new Error("Firebase와 관리자 계정 연결이 필요합니다. 설정 안내를 확인해 주세요.");
  const [{ initializeApp }, module] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js"),
  ]);
  authModule = module; auth = module.getAuth(initializeApp(config.firebase));
  auth.languageCode = "ko";
  await module.setPersistence(auth, module.inMemoryPersistence);
  loginPanel.querySelectorAll("button, input").forEach(element => { element.disabled = false; });
  message(notice, "");
  module.onAuthStateChanged(auth, user => {
    generation++;
    records = []; next = null; output.replaceChildren(); workspace.hidden = true;
    loginPanel.hidden = false;
    loginForm.hidden = Boolean(user); account.hidden = !user; verification.hidden = true;
    password.value = "";
    if (user) void openAccount(user);
    else { document.querySelector("#admin-account-email").textContent = ""; message(notice, ""); }
  });
} catch (error) { message(notice, error.message, "error"); }
