import { audit, auditLog, reqInfo } from "@/lib/audit";
import { verifyPassword } from "@/lib/crypto";
import { needSudo } from "@/lib/guard";
import { listSessions, patchSession, requestSession, revokeAllExcept, revokeSession, SUDO_MS } from "@/lib/session";
import { beginTwoFa, checkTwoFa, confirmTwoFa, disableTwoFa, recoveryLeft, twoFaEnabled } from "@/lib/twofa";
import { currentUser } from "@/lib/users";

// Zabezpečení vlastního účtu: dvoufázové ověření, přihlášená zařízení, nové ověření a historie přihlášení
export async function GET(req: Request) {
  const u = await currentUser();
  const s = await requestSession(req);
  return Response.json({
    twoFa: await twoFaEnabled(u),
    recoveryLeft: await recoveryLeft(u),
    sessions: (await listSessions(u)).map(({ setup, sudo, ...x }) => ({ ...x, current: x.sid === s?.sid })),
    events: await auditLog(20, u.name),
  });
}

export async function POST(req: Request) {
  const u = await currentUser();
  const s = await requestSession(req);
  const { ip } = reqInfo(req);
  const body = (await req.json()) as { action: string; code?: string; sid?: string; password?: string };
  const sensitive = ["2fa-disable", "revoke", "revoke-others"];
  if (sensitive.includes(body.action)) {
    const deny = await needSudo(req);
    if (deny) return deny;
  }
  try {
    switch (body.action) {
      case "reauth": {
        // nové ověření heslem (a kódem, je-li 2FA): na 10 minut povolí citlivé kroky
        const ok = (await verifyPassword(body.password ?? "", u.password)) && (await checkTwoFa(u, body.code ?? ""));
        if (!ok) {
          await audit({ user: u.name, event: "chybné ověření pro citlivý krok", ip });
          await new Promise((r) => setTimeout(r, 600));
          return Response.json({ error: "Heslo nebo kód nesedí." }, { status: 401 });
        }
        if (s) await patchSession(u, s.sid, { sudo: Date.now() + SUDO_MS });
        return Response.json({ ok: true, need2fa: false });
      }
      case "2fa-begin":
        return Response.json(await beginTwoFa(u));
      case "2fa-confirm": {
        const recovery = await confirmTwoFa(u, body.code ?? "");
        // povinné nastavení hotové: relace smí zase všude
        if (s) await patchSession(u, s.sid, { setup: false });
        await audit({ user: u.name, event: "2FA zapnuto", ip });
        return Response.json({ recovery });
      }
      case "2fa-disable":
        // vypnout jen s platným kódem, aby to nešlo z cizího otevřeného prohlížeče
        if (!(await checkTwoFa(u, body.code ?? ""))) return Response.json({ error: "Kód nesedí." }, { status: 400 });
        await disableTwoFa(u);
        await audit({ user: u.name, event: "2FA vypnuto", ip });
        return Response.json({ ok: true });
      case "revoke":
        await revokeSession(u, body.sid ?? "");
        await audit({ user: u.name, event: "odhlášeno zařízení", ip });
        return Response.json({ ok: true });
      case "revoke-others":
        await revokeAllExcept(u, s?.sid ?? null);
        await audit({ user: u.name, event: "odhlášena ostatní zařízení", ip });
        return Response.json({ ok: true });
    }
    return Response.json({ error: "Neznámá akce." }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
