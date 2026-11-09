import { redis } from "./store";

// Záznam událostí zabezpečení (přihlášení, zámky, 2FA, odhlášení, změny práv). Posledních 500,
// vlastník vidí všechny v Nastavení → Správa účtů, každý své v Nastavení → Zabezpečení.
export type AuditEvent = { at: string; user: string; event: string; detail?: string; device?: string; ip?: string };
const KEY = "zr:audit";

export const reqInfo = (req: Request) => ({
  ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || undefined,
  ua: req.headers.get("user-agent") ?? "",
});

export async function audit(e: Omit<AuditEvent, "at">) {
  if (!redis) return;
  await redis.lpush(KEY, JSON.stringify({ at: new Date().toISOString(), ...e }));
  await redis.ltrim(KEY, 0, 499);
}

export async function auditLog(limit = 100, user?: string): Promise<AuditEvent[]> {
  if (!redis) return [];
  const rows = await redis.lrange<string | AuditEvent>(KEY, 0, 499);
  return rows
    .map((r) => (typeof r === "string" ? (JSON.parse(r) as AuditEvent) : r))
    .filter((e) => user === undefined || e.user === user)
    .slice(0, limit);
}
