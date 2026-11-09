import { accessFor } from "@/lib/access";
import { audit, reqInfo } from "@/lib/audit";
import { verifyPassword } from "@/lib/crypto";
import { securityNotice } from "@/lib/notify";
import { COOKIE, device, MAX_AGE, makeSession } from "@/lib/session";
import { redis } from "@/lib/store";
import { checkTwoFa, twoFaEnabled } from "@/lib/twofa";
import { authEnabled, findUser, users, type User } from "@/lib/users";

// odtlačok, proti kterému se ověří neznámé jméno (stejná práce jako u skutečného účtu)
const DUMMY = "pbkdf2-sha256$310000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

// proti hádání: nejvýš 10 pokusů za 15 minut z jedné adresy a 5 chybných na jeden účet (pak zámek na 15 minut)
const IP_LIMIT = 10;
const ACCOUNT_LIMIT = 5;
const WINDOW = 15 * 60;
const memory = new Map<string, { n: number; until: number }>(); // bez databáze jen v rámci jedné instance

async function bump(key: string) {
  if (redis) {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, WINDOW);
    return n;
  }
  const now = Date.now();
  const e = memory.get(key);
  const next = e && e.until > now ? { n: e.n + 1, until: e.until } : { n: 1, until: now + WINDOW * 1000 };
  memory.set(key, next);
  return next.n;
}
const failures = async (u: User) => (redis ? Number((await redis.get<number>(failKey(u))) ?? 0) : 0);
const failKey = (u: User) => `zr:fail:${u.name.toLowerCase() || "_"}`;
const pause = () => new Promise((r) => setTimeout(r, 600));

export async function POST(req: Request) {
  if (!authEnabled()) return Response.json({ ok: true });
  const { ip, ua } = reqInfo(req);
  if ((await bump(`zr:login:${ip ?? "neznámá"}`)) > IP_LIMIT) {
    return Response.json({ error: "Příliš mnoho pokusů. Zkus to znovu za 15 minut." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { name?: string; password?: string; code?: string };
  const user = findUser(body.name ?? "");

  // zamčený účet: neověřovat ani správné heslo, dokud zámek nevyprší
  if (user && (await failures(user)) >= ACCOUNT_LIMIT) {
    await pause();
    return Response.json({ error: "Účet je po opakovaných chybách na 15 minut zamčený." }, { status: 429 });
  }
  const fail = async (why: string) => {
    await pause();
    if (user) {
      const n = await bump(failKey(user));
      await audit({ user: user.name, event: "chybné přihlášení", detail: why, ip, device: device(ua) });
      if (n === ACCOUNT_LIMIT) {
        await audit({ user: user.name, event: "účet zamčen na 15 minut", ip });
        await securityNotice(user, "Účet dočasně zamčen", `${ACCOUNT_LIMIT} chybných pokusů o přihlášení (adresa ${ip ?? "neznámá"}). Účet je na 15 minut zamčený.`);
      }
    }
  };

  // neznámé jméno ověříme proti nesmyslnému odtlačku, ať odpověď trvá stejně dlouho a neprozradí, kdo existuje
  const ok = await verifyPassword(body.password ?? "", user?.password ?? DUMMY);
  if (!ok || !user) {
    await fail("heslo");
    return Response.json({ error: "Nesprávné jméno nebo heslo." }, { status: 401 });
  }
  // druhý krok: kód z aplikace nebo záložní kód (bez něj cookie nedostane)
  const has2fa = await twoFaEnabled(user);
  if (has2fa) {
    if (!body.code) return Response.json({ need2fa: true });
    if (!(await checkTwoFa(user, body.code))) {
      await fail("kód 2FA");
      return Response.json({ error: "Kód nesedí.", need2fa: true }, { status: 401 });
    }
  }
  if (redis) await Promise.all([redis.del(`zr:login:${ip ?? "neznámá"}`), redis.del(failKey(user))]);

  // vlastník vyžaduje 2FA a účet ho nemá: pustit jen do nastavení 2FA
  const setup = !has2fa && Boolean((await accessFor(user)).require2fa);
  const cookie = await makeSession(user, ua, { setup });
  await audit({ user: user.name, event: "přihlášení", detail: has2fa ? "s 2FA" : "bez 2FA", ip, device: device(ua) });
  await securityNotice(user, "Nové přihlášení", `${new Date().toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })}, ${device(ua)}, adresa ${ip ?? "neznámá"}.`);

  const res = Response.json({ ok: true, setup });
  res.headers.append("Set-Cookie", `${COOKIE}=${cookie}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
  return res;
}

// přihlašovací stránka: ptát se na jméno, jen když je víc účtů
export async function GET() {
  return Response.json({ multi: users().length > 1 || Boolean(users()[0]?.name) });
}
