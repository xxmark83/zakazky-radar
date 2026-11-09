// Kryptografie pro přihlášení: odtlačky hesel (PBKDF2), HMAC, náhodná id a jednorázové kódy (TOTP, RFC 6238).
// Jen Web Crypto, běží v proxy i v API i v prohlížeči (generátor odtlačku na /heslo).
const enc = new TextEncoder();

export const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const fromB64url = (s: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
export const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export function randomId(bytes = 16) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

// porovnání bez předčasného konce, aby se nic nedalo hádat podle času odpovědi
export function sameText(a: string, b: string) {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function hmacHex(key: string, message: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

export async function sha256Hex(text: string) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

// ---------- odtlačky hesel: „pbkdf2-sha256$iterace$sůl$odtlaček“ (bez : a , – vejde se do USERS) ----------
const ITERATIONS = 310_000; // doporučení OWASP pro PBKDF2-SHA256

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${ITERATIONS}$${b64url(salt)}$${b64url(await pbkdf2(password, salt, ITERATIONS))}`;
}

export const isHash = (stored: string) => stored.startsWith("pbkdf2-sha256$");

/** Ověří heslo proti uloženému odtlačku (nebo – kvůli přechodu – proti heslu v čitelné podobě). */
export async function verifyPassword(password: string, stored: string) {
  if (!isHash(stored)) return sameText(password, stored);
  const [, iter, salt, hash] = stored.split("$");
  const got = b64url(await pbkdf2(password, fromB64url(salt), Number(iter)));
  return sameText(got, hash);
}

// ---------- TOTP (Google Authenticator, 1Password, Microsoft Authenticator…) ----------
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Uint8Array) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function fromBase32(s: string): Uint8Array<ArrayBuffer> {
  const clean = s.replace(/=+$/, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export const newTotpSecret = () => base32(crypto.getRandomValues(new Uint8Array(20)));

async function totpAt(secret: string, counter: number) {
  const key = await crypto.subtle.importKey("raw", fromBase32(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(0, Math.floor(counter / 2 ** 32));
  msg.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg.buffer));
  const o = h[19] & 15;
  const code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

/** Číslo 30s okna, ve kterém kód platí (±1 okno kvůli nepřesným hodinám), nebo null. */
export async function verifyTotp(secret: string, code: string, now = Date.now()) {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const t = Math.floor(now / 30_000);
  for (const step of [0, -1, 1]) if (sameText(await totpAt(secret, t + step), c)) return t + step;
  return null;
}

// ---------- šifrování citlivých hodnot v databázi (AES-GCM) ----------
// Klíč je v proměnné AUTH_KEY ve Vercelu, ne v databázi – samotný přístup k databázi tak nestačí.
// Bez AUTH_KEY se ukládá jako dřív (nešifrovaně); po jeho nastavení se hodnoty zašifrují při dalším zápisu.
async function aesKey() {
  const k = process.env.AUTH_KEY;
  if (!k) return null;
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(`zr-aes|${k}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(text: string) {
  const key = await aesKey();
  if (!key) return text;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
  return `enc:v1:${b64url(iv)}:${b64url(ct)}`;
}

export async function unseal(stored: string) {
  if (!stored.startsWith("enc:v1:")) return stored; // uloženo před nastavením AUTH_KEY
  const key = await aesKey();
  if (!key) throw new Error("Chybí AUTH_KEY pro dešifrování.");
  const [, , iv, ct] = stored.split(":");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, key, fromB64url(ct)));
}
