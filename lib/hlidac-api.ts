import { createHash } from "node:crypto";
import { redis } from "./store";

// Všechny dotazy na API Hlídače státu jdou přes tuhle frontu: nejvýš ~3 za sekundu (jejich limit jsou 4),
// při 429 („příliš mnoho dotazů“) počkat podle Retry-After a zkusit znovu, a odpovědi chvíli držet
// v Redisu, ať se stejný dotaz (historie zadavatele, hlídání smluv) neposílá pořád dokola.
const UA = "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)";
const GAP = 350;
let chain: Promise<unknown> = Promise.resolve();
let last = 0;

export class HlidacError extends Error {
  constructor(public status: number, detail: string) {
    super(status === 429 ? "Hlídač státu teď odmítá další dotazy (limit počtu dotazů), zkus to za minutu" : `Hlídač státu ${status}${detail ? `: ${detail}` : ""}`);
  }
}

function slot<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = last + GAP - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fn();
  });
  chain = run.catch(() => {});
  return run;
}

/** GET na api.hlidacstatu.cz s tokenem; ttl = kolik sekund držet odpověď v Redisu (0 = nedržet). */
export async function hlidacGet<T = any>(url: string, ttl = 0): Promise<T> {
  const token = process.env.HLIDAC_TOKEN;
  if (!token) throw new HlidacError(401, "chybí HLIDAC_TOKEN");
  const key = `zr:hlidac:${createHash("sha256").update(url).digest("hex").slice(0, 32)}`;
  if (ttl && redis) {
    const hit = await redis.get<T>(key).catch(() => null);
    if (hit) return hit;
  }
  for (let attempt = 0; ; attempt++) {
    const res = await slot(() =>
      fetch(url, { headers: { Authorization: `Token ${token}`, "User-Agent": UA }, cache: "no-store", signal: AbortSignal.timeout(20_000) }),
    );
    if (res.status === 429 && attempt < 2) {
      const after = Number(res.headers.get("retry-after"));
      await new Promise((r) => setTimeout(r, Math.min(10_000, (after > 0 ? after * 1000 : 2000 * (attempt + 1)))));
      continue;
    }
    if (!res.ok) throw new HlidacError(res.status, (await res.text().catch(() => "")).slice(0, 160));
    const data = (await res.json()) as T;
    if (ttl && redis) await redis.set(key, data, { ex: ttl }).catch(() => {});
    return data;
  }
}
