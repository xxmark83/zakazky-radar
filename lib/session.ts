import { hmacHex, randomId, sameText, sha256Hex } from "./crypto";
import { redis } from "./store";
import { findUser, users, type User } from "./users";

// Přihlášení: cookie „jméno.relace.platnost.podpis“ na 90 dní, HttpOnly a Secure.
// - podpis je HMAC tajným klíčem serveru (náhodný, v databázi), cookie tedy o hesle nic neprozradí
// - do podpisu vstupuje i otisk uloženého hesla, takže změna hesla odhlásí všechna zařízení účtu
// - každé zařízení má vlastní relaci v databázi a dá se samostatně odhlásit (Nastavení → Zabezpečení)
export { sameText };
export const COOKIE = "zr-session";
export const MAX_AGE = 90 * 86400; // sekundy

let secretCache: string | null = null;
async function serverSecret() {
  if (secretCache) return secretCache;
  if (redis) {
    let s = await redis.get<string>("zr:auth:secret");
    if (!s) {
      await redis.set("zr:auth:secret", randomId(32), { nx: true }); // vytvoří ho jen první požadavek
      s = await redis.get<string>("zr:auth:secret");
    }
    if (s) return (secretCache = s);
  }
  // bez databáze (lokální vývoj): odvozeno z účtů
  return (secretCache = await sha256Hex(`zr-local|${users().map((u) => `${u.name}:${u.password}`).join("|")}`));
}

const fingerprint = async (u: User) => (await sha256Hex(`zr-pw|${u.password}`)).slice(0, 16);
const sign = async (u: User, name: string, sid: string, exp: number) =>
  hmacHex(await serverSecret(), `v3|${name}|${sid}|${exp}|${await fingerprint(u)}`);
const sessionsKey = (u: User) => `zr:sessions:${u.name.toLowerCase() || "_"}`;

export type SessionInfo = { sid: string; created: string; seen: string; device: string };

// krátký popis zařízení z User-Agent (jen pro seznam přihlášených zařízení)
function device(ua: string) {
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "zařízení";
  const app = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "prohlížeč";
  return `${app}, ${os}`;
}

export async function makeSession(u: User, ua = "") {
  const sid = randomId(12);
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const name = encodeURIComponent(u.name);
  const now = new Date().toISOString();
  if (redis) await redis.hset(sessionsKey(u), { [sid]: { created: now, seen: now, device: device(ua) } });
  return `${name}.${sid}.${exp}.${await sign(u, name, sid, exp)}`;
}

export function parseSession(value: string | undefined) {
  const [name, sid, exp, sig] = (value ?? "").split(".");
  return { name: name ?? "", sid: sid ?? "", exp: Number(exp), sig: sig ?? "" };
}

/** Přihlášený uživatel podle cookie, nebo null. */
export async function sessionUser(value: string | undefined): Promise<User | null> {
  const { name, sid, exp, sig } = parseSession(value);
  if (!sid || !sig || !exp || exp < Date.now() / 1000) return null;
  const u = findUser(decodeURIComponent(name));
  if (!u || !sameText(sig, await sign(u, name, sid, exp))) return null;
  // relaci ověřujeme v databázi při každém požadavku, aby odhlášení platilo okamžitě
  if (redis) {
    const s = await redis.hget<SessionInfo>(sessionsKey(u), sid);
    if (!s) return null; // odhlášeno (i z jiného zařízení)
    // „naposledy aktivní“ stačí po deseti minutách
    if (Date.now() - new Date(s.seen).getTime() > 600_000)
      redis.hset(sessionsKey(u), { [sid]: { ...s, seen: new Date().toISOString() } }).catch(() => {});
  }
  return u;
}

export async function listSessions(u: User): Promise<SessionInfo[]> {
  if (!redis) return [];
  const all = (await redis.hgetall<Record<string, Omit<SessionInfo, "sid">>>(sessionsKey(u))) ?? {};
  return Object.entries(all)
    .map(([sid, s]) => ({ sid, ...s }))
    .sort((a, b) => b.seen.localeCompare(a.seen));
}

export async function revokeSession(u: User, sid: string) {
  if (redis) await redis.hdel(sessionsKey(u), sid);
}

export async function revokeAllExcept(u: User, keep: string | null) {
  for (const s of await listSessions(u)) if (s.sid !== keep) await revokeSession(u, s.sid);
}

// tajný odkaz na kalendář lhůt: kalendáře (Google, Apple) se nepřihlašují, proto klíč v adrese.
// Každý uživatel má svůj; změna jeho hesla zneplatní i starý odkaz.
export async function calendarKey(u: User) {
  return (await hmacHex(await serverSecret(), `cal|${u.name}|${await fingerprint(u)}`)).slice(0, 32);
}
