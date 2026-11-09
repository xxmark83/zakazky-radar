import { newTotpSecret, randomId, seal, sha256Hex, unseal, verifyTotp } from "./crypto";
import { redis } from "./store";
import type { User } from "./users";

// Dvoufázové ověření: kód z aplikace (Google Authenticator, 1Password, Microsoft Authenticator…)
// a 8 záložních kódů pro případ ztráty telefonu (uložené jen jako otisky, každý jde použít jednou).
type TwoFa = { secret: string; enabled: boolean; recovery: string[]; last: number };
const key = (u: User) => `zr:2fa:${u.name.toLowerCase() || "_"}`;
// tajný klíč je v databázi zašifrovaný klíčem AUTH_KEY z Vercelu (lib/crypto.ts seal)
async function load(u: User): Promise<TwoFa | null> {
  const raw = redis ? await redis.get<TwoFa>(key(u)) : null;
  return raw ? { ...raw, secret: await unseal(raw.secret) } : null;
}
async function save(u: User, v: TwoFa) {
  await redis!.set(key(u), { ...v, secret: await seal(v.secret) });
}

export async function twoFaEnabled(u: User) {
  return Boolean((await load(u))?.enabled);
}

/** Začít zapínání: nový tajný klíč (zatím neaktivní) a odkaz pro aplikaci. */
export async function beginTwoFa(u: User, issuer = "Zakázky radar") {
  if (!redis) throw new Error("Dvoufázové ověření potřebuje databázi (Upstash).");
  const cur = await load(u);
  if (cur?.enabled) throw new Error("Dvoufázové ověření už je zapnuté.");
  const secret = newTotpSecret();
  await save(u, { secret, enabled: false, recovery: [], last: 0 });
  const label = encodeURIComponent(`${issuer}:${u.name || "účet"}`);
  return { secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30` };
}

/** Potvrdit prvním kódem z aplikace; vrátí záložní kódy (ukážou se jen jednou). */
export async function confirmTwoFa(u: User, code: string) {
  const cur = await load(u);
  if (!cur || cur.enabled) throw new Error("Nejdřív začni zapínání znovu.");
  const step = await verifyTotp(cur.secret, code);
  if (step === null) throw new Error("Kód nesedí. Zkontroluj čas v telefonu a zkus aktuální kód.");
  const codes = Array.from({ length: 8 }, () => randomId(6).replace(/[-_]/g, "x").slice(0, 8).toLowerCase());
  await save(u, { ...cur, enabled: true, last: step, recovery: await Promise.all(codes.map((c) => sha256Hex(`zr-rc|${c}`))) });
  return codes;
}

/** Ověřit kód při přihlášení: kód z aplikace (každý jen jednou) nebo záložní kód. */
export async function checkTwoFa(u: User, code: string) {
  const cur = await load(u);
  if (!cur?.enabled) return true;
  const step = await verifyTotp(cur.secret, code);
  if (step !== null && step > cur.last) {
    await save(u, { ...cur, last: step });
    return true;
  }
  const h = await sha256Hex(`zr-rc|${code.trim().toLowerCase()}`);
  if (cur.recovery.includes(h)) {
    await save(u, { ...cur, recovery: cur.recovery.filter((x) => x !== h) });
    return true;
  }
  return false;
}

export async function recoveryLeft(u: User) {
  return (await load(u))?.recovery.length ?? 0;
}

export async function disableTwoFa(u: User) {
  if (redis) await redis.del(key(u));
}
