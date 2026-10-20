// LOCAL UI TEST ONLY. Excluded from the production build. No real data or network storage.
import { handle } from "../server/api.js";
import { HttpError } from "../server/domain.js";
class MemoryDb {
  data = new Map(); sequence = 0;
  async get(collection, id) { return structuredClone(this.data.get(`${collection}/${id}`) || null); }
  async save(collection, id, value, version) {
    const key = `${collection}/${id}`, current = this.data.get(key);
    if (current ? current.version !== version : version) throw new HttpError(409, "충돌");
    this.data.set(key, { ...structuredClone(value), id, version: String(++this.sequence) });
  }
  async query(collection, { field, value, limit = 50 } = {}) {
    return [...this.data.entries()].filter(([key, doc]) => key.startsWith(`${collection}/`) && (!field || doc[field] === value))
      .map(([, doc]) => structuredClone(doc)).slice(0, limit);
  }
}
const env = Object.fromEntries(["FIREBASE_PROJECT_ID", "FIREBASE_API_KEY", "FIREBASE_AUTH_DOMAIN", "FIREBASE_APP_ID", "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY", "PHONE_HASH_SECRET", "ADMIN_UIDS", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"].map(k => [k, "fixture-only"]));
env.SITE_ORIGIN = location.origin;
const dependencies = { db: new MemoryDb(), challenge: async () => {} };
const originalFetch = window.fetch.bind(window);
window.fetch = (url, init = {}) => {
  if (typeof url === "string" && url.startsWith("/api/booking/")) {
    const request = new Request(new URL(url, location.origin), init);
    // Browsers strip Origin from script-created Request headers. Model the server's received header.
    return handle({ url: request.url, method: request.method, text: () => request.text(),
      headers: { get: name => name.toLowerCase() === "origin" ? location.origin : request.headers.get(name) } }, env, dependencies);
  }
  return originalFetch(url, init);
};
const widgets = new Map();
window.turnstile = {
  render(selector, options) {
    const element = document.querySelector(selector);
    element.textContent = "테스트용 확인 · 실제 예약이 저장되지 않습니다.";
    widgets.set(selector, options); options.callback("fixture-token"); return selector;
  },
  reset(id) { widgets.get(id)?.callback("fixture-token"); },
};
await import("../js/reservation.js");
