import { COOKIE, MAX_AGE, makeSession, sameText } from "@/lib/session";
import { redis } from "@/lib/store";

// proti hádání hesla: nejvýš 10 pokusů za 15 minut z jedné adresy
const LIMIT = 10;
const WINDOW = 15 * 60;
const memory = new Map<string, { n: number; until: number }>(); // bez databáze jen v rámci jedné instance

async function attempt(ip: string) {
  if (redis) {
    const key = `zr:login:${ip}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, WINDOW);
    return n;
  }
  const now = Date.now();
  const e = memory.get(ip);
  const next = e && e.until > now ? { n: e.n + 1, until: e.until } : { n: 1, until: now + WINDOW * 1000 };
  memory.set(ip, next);
  return next.n;
}

export async function POST(req: Request) {
  const password = process.env.APP_PASSWORD;
  if (!password) return Response.json({ ok: true });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "neznámá";
  if ((await attempt(ip)) > LIMIT) {
    return Response.json({ error: "Příliš mnoho pokusů. Zkus to znovu za 15 minut." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (!sameText(body.password ?? "", password)) {
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({ error: "Nesprávné heslo." }, { status: 401 });
  }
  if (redis) await redis.del(`zr:login:${ip}`);
  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${COOKIE}=${await makeSession(password)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
  );
  return res;
}
