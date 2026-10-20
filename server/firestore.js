import { HttpError } from "./domain.js";
const encoder = new TextEncoder();
const base64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
let cachedToken;
export async function fingerprint(secret, text) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(text))));
}
async function accessToken(env) {
  if (cachedToken?.email === env.FIREBASE_CLIENT_EMAIL && cachedToken.until > Date.now()) return cachedToken.token;
  const seconds = Math.floor(Date.now() / 1000);
  const unsigned = [ { alg: "RS256", typ: "JWT" }, {
    iss: env.FIREBASE_CLIENT_EMAIL, scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token", iat: seconds, exp: seconds + 3600,
  } ].map(value => base64(encoder.encode(JSON.stringify(value)))).join(".");
  const pem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = base64(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(unsigned))));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!response.ok) throw new HttpError(503, "예약 서비스 연결을 확인하고 있습니다. 잠시 후 다시 이용해 주세요.");
  const data = await response.json();
  cachedToken = { email: env.FIREBASE_CLIENT_EMAIL, token: data.access_token, until: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.token;
}
export function encode(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
}
export function decode(value) {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([k, v]) => [k, decode(v)]));
}
export class Firestore {
  constructor(env) {
    this.env = env;
    this.root = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  }
  async call(path, body, method = "POST") {
    const response = await fetch(`https://firestore.googleapis.com/v1/${this.root}${path}`, {
      method, headers: { Authorization: `Bearer ${await accessToken(this.env)}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if ([409, 412].includes(response.status) || ["FAILED_PRECONDITION", "ABORTED", "ALREADY_EXISTS"].includes(error.error?.status)) {
        throw new HttpError(409, "다른 요청이 먼저 처리되었습니다. 새로 조회해 주세요.");
      }
      throw new HttpError(503, "예약 정보를 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    return response.json();
  }
  unpack(doc) {
    return doc ? { ...decode({ mapValue: { fields: doc.fields } }), id: doc.name.split("/").pop(), version: doc.updateTime } : null;
  }
  async get(collection, id) { return this.unpack(await this.call(`/${collection}/${id}`, null, "GET")); }
  async save(collection, id, data, version = null) {
    const { id: ignored, version: ignoredVersion, ...stored } = data;
    const body = { writes: [{ update: { name: `${this.root}/${collection}/${id}`, fields: encode(stored).mapValue.fields },
      currentDocument: version ? { updateTime: version } : { exists: false } }] };
    await this.call(":commit", body);
  }
  async remove(collection, id, version) {
    await this.call(":commit", { writes: [{ delete: `${this.root}/${collection}/${id}`, currentDocument: { updateTime: version } }] });
  }
  async query(collection, { field, value, after, limit = 50 } = {}) {
    const query = { from: [{ collectionId: collection }], limit };
    if (field) {
      query.where = { fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: encode(value) } };
      query.orderBy = [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }];
    }
    else {
      query.orderBy = [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }, { field: { fieldPath: "__name__" }, direction: "DESCENDING" }];
      if (after) query.startAt = { values: [encode(after.createdAt), { referenceValue: `${this.root}/${collection}/${after.id}` }], before: false };
    }
    return (await this.call(":runQuery", { structuredQuery: query })).filter(row => row.document).map(row => this.unpack(row.document));
  }
}
