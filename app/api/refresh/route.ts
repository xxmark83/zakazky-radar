import { audit, reqInfo } from "@/lib/audit";
import { needSudo } from "@/lib/guard";
import { clearRefreshCache, refreshReady, startRefresh } from "@/lib/refresh";
import { redis } from "@/lib/store";
import { currentUser } from "@/lib/users";

// Stáhnout všechno znovu: jen vlastník, po novém ověření heslem a s napsaným potvrzením, nejvýš jednou za 6 hodin
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me.owner) return Response.json({ error: "Jen pro správce." }, { status: 403 });
  const deny = await needSudo(req);
  if (deny) return deny;
  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (body.confirm !== "STÁHNOUT") return Response.json({ error: "Potvrzení nesedí – napiš STÁHNOUT." }, { status: 400 });
  if (!refreshReady()) return Response.json({ error: "Chybí GH_DISPATCH_TOKEN ve Vercelu (návod je u tlačítka)." }, { status: 400 });
  if (redis && !(await redis.set("zr:refresh:lock", 1, { nx: true, ex: 6 * 3600 }))) {
    return Response.json({ error: "Celé stažení už běží nebo proběhlo v posledních 6 hodinách." }, { status: 429 });
  }
  const r = await startRefresh(me.name || "vlastník");
  clearRefreshCache();
  await audit({ user: me.name, event: "stáhnout všechna data znovu", detail: r.steps.map((s) => `${s.name}: ${s.ok ? "ok" : s.error}`).join("; "), ip: reqInfo(req).ip });
  // když se nic nespustilo, zámek uvolnit, ať jde zkusit znovu
  if (redis && !r.steps.some((s) => s.ok)) await redis.del("zr:refresh:lock");
  const failed = r.steps.filter((s) => !s.ok);
  const error = failed.length
    ? failed.some((s) => /40[13]/.test(s.error ?? ""))
      ? "GitHub odmítl token – zkontroluj GH_DISPATCH_TOKEN (jen repo zakazky-radar, Actions a Contents: Read and write, nevypršel)."
      : "Část se nepodařilo spustit, zkus to za chvíli."
    : undefined;
  return Response.json({ ...r, error }, { status: r.steps.some((s) => s.ok) ? 200 : 502 });
}
