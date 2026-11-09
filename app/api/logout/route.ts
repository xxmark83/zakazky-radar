import { audit, reqInfo } from "@/lib/audit";
import { COOKIE, requestSession, revokeSession } from "@/lib/session";

// odhlášení: smazat relaci v databázi (cookie by jinak šla dál použít) i cookie v prohlížeči
export async function POST(req: Request) {
  const s = await requestSession(req);
  if (s) {
    await revokeSession(s.user, s.sid);
    await audit({ user: s.user.name, event: "odhlášení", device: s.info.device, ip: reqInfo(req).ip });
  }
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return res;
}
