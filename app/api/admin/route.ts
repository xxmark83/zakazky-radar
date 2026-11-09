import { accessMap, setAccess, type Access } from "@/lib/access";
import { audit, auditLog, reqInfo } from "@/lib/audit";
import { isHash } from "@/lib/crypto";
import { needSudo } from "@/lib/guard";
import { revokeAllExcept } from "@/lib/session";
import { disableTwoFa, twoFaEnabled } from "@/lib/twofa";
import { currentUser, findUser, users } from "@/lib/users";

// Správa účtů: jen vlastník vidí ostatní účty a nastavuje, co smí hledat
async function ownerOnly() {
  return (await currentUser()).owner ? null : Response.json({ error: "Jen pro vlastníka." }, { status: 403 });
}

export async function GET() {
  const deny = await ownerOnly();
  if (deny) return deny;
  const map = await accessMap();
  return Response.json({
    users: await Promise.all(
      users()
        .filter((u) => !u.owner)
      .map(async (u) => ({
        name: u.name,
        email: Boolean(u.email),
        access: map[u.name] ?? { presets: null, edit: false },
        twoFa: await twoFaEnabled(u),
        hashed: isHash(u.password),
      })),
    ),
    plain: users().filter((u) => !isHash(u.password)).map((u) => u.name), // hesla v čitelné podobě ve Vercelu
    events: await auditLog(60),
    authKey: Boolean(process.env.AUTH_KEY),
  });
}

export async function POST(req: Request) {
  const deny = (await ownerOnly()) ?? (await needSudo(req));
  if (deny) return deny;
  const me = await currentUser();
  const { ip } = reqInfo(req);
  const body = (await req.json()) as { name: string; access?: Access; reset2fa?: boolean; logoutAll?: boolean };
  try {
    const target = findUser(body.name);
    if (!target || target.owner) throw new Error("Neznámý účet.");
    // ztracený telefon: vlastník vypne kolegovi dvoufázové ověření, případně ho odhlásí ze všech zařízení
    if (body.reset2fa) await disableTwoFa(target);
    if (body.logoutAll) await revokeAllExcept(target, null);
    if (body.access) await setAccess(body.name, body.access);
    const what = [
      body.reset2fa && "vypnuto 2FA",
      body.logoutAll && "odhlášen ze všech zařízení",
      body.access && `práva: ${body.access.presets?.join(", ") ?? "vše"}${body.access.edit ? ", úpravy" : ""}${body.access.require2fa ? ", povinné 2FA" : ""}`,
    ].filter(Boolean);
    await audit({ user: me.name, event: `správa účtu ${body.name}`, detail: what.join("; "), ip });
    return Response.json({ ok: true });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
