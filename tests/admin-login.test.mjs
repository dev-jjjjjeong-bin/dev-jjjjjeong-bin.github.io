import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// Exercise the real UI handlers with an isolated SDK and DOM; no credentials or mail are used.
async function setup({ verified = true, allowed = true, ready = true } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: "", hidden: false, disabled: true, textContent: "", handlers: {},
      addEventListener(type, callback) { this.handlers[type] = callback; },
      reportValidity() { return true; }, setAttribute() {}, removeAttribute() {},
      replaceChildren() {}, append() {}, querySelectorAll() { return []; },
    });
    return elements.get(id);
  };
  const calls = [];
  const auth = { currentUser: null };
  let observer;
  const user = { email: "admin@example.com", emailVerified: verified,
    async getIdToken(force) { calls.push(["token", force]); return "test-token"; } };
  const sdk = {
    getAuth: () => auth, inMemoryPersistence: {}, setPersistence: async () => {},
    onAuthStateChanged(_, callback) { observer = callback; callback(null); },
    async signInWithEmailAndPassword(_, email, password) {
      calls.push(["login", email, password]); auth.currentUser = user; observer(user);
    },
    async signOut() { auth.currentUser = null; observer(null); },
    async sendPasswordResetEmail(_, email) { calls.push(["reset", email]); },
    async sendEmailVerification() { calls.push(["verify"]); },
    async reload() { calls.push(["reload"]); },
  };
  let source = await readFile(new URL("../js/booking-admin.js", import.meta.url), "utf8");
  source = source.replace(/^import .*;\n/gm, "")
    .replace(/import\("https:[^"]+firebase-app.js"\)/, "Promise.resolve({ initializeApp: () => ({}) })")
    .replace(/import\("https:[^"]+firebase-auth.js"\)/, "Promise.resolve(sdk)");
  const context = vm.createContext({ sdk, document: { querySelector: element },
    products: [], productLabel: () => "", statuses: {}, scheduleLabel: () => "",
    node: () => element("generated"), message: (target, text) => { target.textContent = text; },
    api: async path => {
      if (path === "config") return { ready, firebase: {} };
      calls.push(["api", path]);
      if (!allowed) throw new Error("예약 관리 권한이 없는 계정입니다.");
      return { records: [], next: null };
    },
  });
  await vm.runInContext(`(async () => { ${source} })()`, context);
  const fire = async (id, type = "click") => {
    element(id).handlers[type]({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
  };
  const login = async () => {
    element("#admin-email").value = " admin@example.com ";
    element("#admin-password").value = "example-password";
    await fire("#admin-login-form", "submit");
  };
  return { element, calls, user, sdk, fire, login };
}
test("관리자 이메일 로그인·로그아웃 및 승인되지 않은 계정 차단 화면", async () => {
  const ui = await setup();
  await ui.login();
  assert.deepEqual(ui.calls[0], ["login", "admin@example.com", "example-password"]);
  assert.equal(ui.element("#admin-password").value, "");
  assert.equal(ui.element("#admin-workspace").hidden, false);
  await ui.fire("#logout-button");
  assert.equal(ui.element("#admin-workspace").hidden, true);
  assert.equal(ui.element("#admin-login-form").hidden, false);
  const denied = await setup({ allowed: false });
  await denied.login();
  assert.equal(denied.element("#admin-workspace").hidden, true);
  assert.match(denied.element("#admin-message").textContent, /권한이 없는/);
  await denied.fire("#switch-account-button");
  assert.equal(denied.element("#admin-login-form").hidden, false);
});
test("이메일 확인 전에는 예약을 조회하지 않고 확인 후 토큰을 갱신", async () => {
  const ui = await setup({ verified: false });
  await ui.login();
  assert.equal(ui.calls.some(call => call[0] === "api"), false);
  assert.equal(ui.element("#admin-verification").hidden, false);
  await ui.fire("#verify-email-button");
  assert.ok(ui.calls.some(call => call[0] === "verify"));
  await ui.fire("#check-email-button");
  assert.equal(ui.calls.some(call => call[0] === "api"), false);
  ui.user.emailVerified = true;
  await ui.fire("#check-email-button");
  assert.ok(ui.calls.some(call => call[0] === "token" && call[1] === true));
  assert.equal(ui.element("#admin-workspace").hidden, false);
});
test("재설정은 비밀번호 없이 가능하며 없는 계정도 같은 안내; 로그인 실패 후 재시도", async () => {
  const ui = await setup();
  ui.element("#admin-email").value = "admin@example.com";
  await ui.fire("#reset-password-button");
  const success = ui.element("#admin-message").textContent;
  ui.sdk.sendPasswordResetEmail = async () => { throw { code: "auth/user-not-found" }; };
  await ui.fire("#reset-password-button");
  assert.equal(ui.element("#admin-message").textContent, success);
  const signIn = ui.sdk.signInWithEmailAndPassword;
  ui.sdk.signInWithEmailAndPassword = async () => { throw { code: "auth/invalid-credential" }; };
  await ui.login();
  assert.match(ui.element("#admin-message").textContent, /이메일과 비밀번호/);
  assert.equal(ui.element("#admin-password").value, "");
  ui.sdk.signInWithEmailAndPassword = signIn;
  await ui.login();
  assert.equal(ui.element("#admin-workspace").hidden, false);
});
