import { COOKIE, listSessions, parseSession, revokeAllExcept, revokeSession } from "@/lib/session";
import { beginTwoFa, checkTwoFa, confirmTwoFa, disableTwoFa, recoveryLeft, twoFaEnabled } from "@/lib/twofa";
import { currentUser } from "@/lib/users";

// Zabezpečení vlastního účtu: dvoufázové ověření a přihlášená zařízení
const thisSid = (req: Request) =>
  parseSession(req.headers.get("cookie")?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1]).sid;

export async function GET(req: Request) {
  const u = await currentUser();
  return Response.json({
    twoFa: await twoFaEnabled(u),
    recoveryLeft: await recoveryLeft(u),
    sessions: (await listSessions(u)).map((s) => ({ ...s, current: s.sid === thisSid(req) })),
  });
}

export async function POST(req: Request) {
  const u = await currentUser();
  const body = (await req.json()) as { action: string; code?: string; sid?: string };
  try {
    switch (body.action) {
      case "2fa-begin":
        return Response.json(await beginTwoFa(u));
      case "2fa-confirm":
        return Response.json({ recovery: await confirmTwoFa(u, body.code ?? "") });
      case "2fa-disable":
        // vypnout jen s platným kódem, aby to nešlo z cizího otevřeného prohlížeče
        if (!(await checkTwoFa(u, body.code ?? ""))) return Response.json({ error: "Kód nesedí." }, { status: 400 });
        await disableTwoFa(u);
        return Response.json({ ok: true });
      case "revoke":
        await revokeSession(u, body.sid ?? "");
        return Response.json({ ok: true });
      case "revoke-others":
        await revokeAllExcept(u, thisSid(req));
        return Response.json({ ok: true });
    }
    return Response.json({ error: "Neznámá akce." }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
