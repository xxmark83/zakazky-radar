import { COOKIE, parseSession, revokeSession, sessionUser } from "@/lib/session";

// odhlášení: smazat relaci v databázi (cookie by jinak šla dál použít) i cookie v prohlížeči
export async function POST(req: Request) {
  const value = req.headers.get("cookie")?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1];
  const u = await sessionUser(value);
  if (u) await revokeSession(u, parseSession(value).sid);
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return res;
}
