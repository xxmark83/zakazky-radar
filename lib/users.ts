import { AsyncLocalStorage } from "node:async_hooks";

// Používatelia appky. Každý má vlastné přihlášení, vlastní data i nastavení (oddělené klíče v databázi).
// Vercel: USERS = "marek:heslo1,jan:heslo2:jan@firma.cz" (jméno:heslo[:e-mail pro ranní přehled]).
// Bez USERS platí staré APP_PASSWORD pro jednoho uživatele. První uživatel je „vlastník“: jeho data
// zůstávají pod původními klíči, takže se po zapnutí více účtů nic nepřesouvá.
export type User = { name: string; password: string; email: string | null; owner: boolean };

export function users(): User[] {
  const list = (process.env.USERS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [name, password, email] = s.split(":").map((x) => x.trim());
      return { name, password, email: email || null };
    })
    .filter((u) => u.name && u.password);
  if (!list.length && process.env.APP_PASSWORD)
    return [{ name: "", password: process.env.APP_PASSWORD, email: process.env.ALERT_EMAIL ?? null, owner: true }];
  return list.map((u, i) => ({ ...u, owner: i === 0, email: u.email ?? (i === 0 ? (process.env.ALERT_EMAIL ?? null) : null) }));
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
