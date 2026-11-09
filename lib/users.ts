import { AsyncLocalStorage } from "node:async_hooks";

// Používatelia appky. Každý má vlastné přihlášení, vlastní data i nastavení (oddělené klíče v databázi).
// Vercel – každý účet vlastní proměnná (měnit jednoho nevyžaduje znát heslo druhého):
//   OWNER_MAREK = odtlačok[:e-mail]   vlastník (Správa účtů, dosavadní data)
//   USER_MICHAL = odtlačok[:e-mail]   další účty
// Odtlačok se vyrobí na /heslo; zatím jde i heslo v čitelné podobě. Jméno účtu = konec názvu proměnné malými.
// Starší zápis USERS = "marek:heslo1,jan:heslo2:jan@firma.cz" funguje dál (první je vlastník), bez obojího
// platí APP_PASSWORD pro jednoho uživatele.
export type User = { name: string; password: string; email: string | null; owner: boolean };

// „tajemství[:e-mail]“ – e-mail poznáme podle zavináče, tajemství samo dvojtečku nemá (odtlačok ji neobsahuje)
function secretAndEmail(value: string) {
  const m = value.trim().match(/^(.*):([^:@\s]+@[^:\s]+)$/);
  return m ? { password: m[1].trim(), email: m[2] } : { password: value.trim(), email: null };
}

export function users(): User[] {
  const env = process.env;
  const own: User[] = [];
  const others: User[] = [];
  for (const [key, value] of Object.entries(env)) {
    const m = key.match(/^(OWNER|USER)_([A-Z0-9_]+)$/);
    if (!m || !value?.trim()) continue;
    const u = { name: m[2].toLowerCase(), ...secretAndEmail(value), owner: m[1] === "OWNER" };
    (u.owner ? own : others).push(u);
  }
  const legacy = (env.USERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [name, password, email] = s.split(":").map((x) => x.trim());
      return { name: (name ?? "").toLowerCase(), password, email: email || null, owner: false };
    })
    .filter((u) => u.name && u.password);

  // vlastník: OWNER_*, jinak první z USERS, jinak první USER_* podle abecedy
  others.sort((a, b) => a.name.localeCompare(b.name));
  const all = [...own.slice(0, 1), ...legacy, ...others];
  const seen = new Set<string>();
  const list = all.filter((u) => !seen.has(u.name) && Boolean(seen.add(u.name)));
  if (!list.length && env.APP_PASSWORD)
    return [{ name: "", password: env.APP_PASSWORD, email: env.ALERT_EMAIL ?? null, owner: true }];
  return list.map((u, i) => ({ ...u, owner: i === 0, email: u.email ?? (i === 0 ? (env.ALERT_EMAIL ?? null) : null) }));
}

export const authEnabled = () => users().length > 0;
export const findUser = (name: string) => {
  const list = users();
  // jediný uživatel (staré APP_PASSWORD): jméno se nekontroluje
  if (list.length === 1 && !list[0].name) return list[0];
  return list.find((u) => u.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
};
const owner = (): User => users()[0] ?? { name: "", password: "", email: process.env.ALERT_EMAIL ?? null, owner: true };

// kdo je přihlášený v tomto požadavku: ranní běh ho nastaví sám, jinak ho do hlavičky zapíše proxy.ts
const als = new AsyncLocalStorage<User>();
export const withUser = <T>(u: User, fn: () => Promise<T>) => als.run(u, fn);
export const USER_HEADER = "x-zr-user";

export async function currentUser(): Promise<User> {
  const set = als.getStore();
  if (set) return set;
  try {
    const { headers } = await import("next/headers");
    const name = (await headers()).get(USER_HEADER);
    if (name !== null) return findUser(decodeURIComponent(name)) ?? owner();
  } catch {
    // mimo požadavek (skripty)
  }
  return owner();
}

/** Klíč v databázi pro aktuálního uživatele: vlastník „zr:x“, ostatní „zr:u:<jméno>:x“. */
export async function userKey(name: string) {
  const u = await currentUser();
  return u.owner ? `zr:${name}` : `zr:u:${u.name.toLowerCase()}:${name}`;
}
