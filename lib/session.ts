import { findUser, type User } from "./users";

// Přihlášení jménem a heslem (lib/users.ts): po zadání dostane zařízení podepsanou cookie na 90 dní.
// Podpis je HMAC z hesla daného uživatele, takže změna jeho hesla ve Vercelu odhlásí jen jeho zařízení.
export const COOKIE = "zr-session";
export const MAX_AGE = 90 * 86400; // sekundy

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function hmac(password: string, message: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

// porovnání bez předčasného konce, aby se podpis nedal hádat podle času odpovědi
export function sameText(a: string, b: string) {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// cookie: „jméno.platnost.podpis“ (jméno zakódované, u jediného uživatele bez jména prázdné)
export async function makeSession(u: User) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  const name = encodeURIComponent(u.name);
  return `${name}.${expires}.${await hmac(u.password, `zr-session:v2:${name}:${expires}`)}`;
}

/** Přihlášený uživatel podle cookie, nebo null. */
export async function sessionUser(value: string | undefined): Promise<User | null> {
  const [name, exp, sig] = (value ?? "").split(".");
  const expires = Number(exp);
  if (name === undefined || !sig || !expires || expires < Date.now() / 1000) return null;
  const u = findUser(decodeURIComponent(name));
  if (!u) return null;
  return sameText(sig, await hmac(u.password, `zr-session:v2:${name}:${expires}`)) ? u : null;
}

// tajný odkaz na kalendář lhůt: kalendáře (Google, Apple) se nepřihlašují, proto klíč v adrese.
// Každý uživatel má svůj; změna jeho hesla zneplatní i starý odkaz.
export async function calendarKey(u: User) {
  return (await hmac(u.password || "zakazky-radar", `zr-calendar:${u.name}`)).slice(0, 32);
}
