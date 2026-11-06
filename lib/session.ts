// Přihlášení heslem APP_PASSWORD: po zadání dostane zařízení podepsanou cookie na 90 dní.
// Podpis je HMAC z hesla, takže změna hesla ve Vercelu odhlásí všechna zařízení najednou.
export const COOKIE = "zr-session";
export const MAX_AGE = 90 * 86400; // sekundy

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function sign(password: string, expires: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`zr-session:v1:${expires}`)));
}

// porovnání bez předčasného konce, aby se podpis nedal hádat podle času odpovědi
export function sameText(a: string, b: string) {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function makeSession(password: string) {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  return `${expires}.${await sign(password, expires)}`;
}

export async function validSession(value: string | undefined, password: string) {
  const [exp, sig] = (value ?? "").split(".");
  const expires = Number(exp);
  if (!sig || !expires || expires < Date.now() / 1000) return false;
  return sameText(sig, await sign(password, expires));
}

// tajný odkaz na kalendář lhůt: kalendáře (Google, Apple) se nepřihlašují, proto klíč v adrese.
// Odvozený z hesla, takže změna APP_PASSWORD zneplatní i starý odkaz.
export async function calendarKey(password: string | undefined) {
  return (await sign(password || "zakazky-radar", 0)).slice(0, 32);
}
