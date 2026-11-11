import type { Tender } from "../types";

// Hlídač státu – agreguje i podlimitní zakázky z profilů zadavatelů a Věstníku.
// Token zdarma po registraci (nekomerční užití; komerční dle jejich podmínek).
// API v2: /api/v2/vz/hledat (dokumentace api.hlidacstatu.cz/swagger/v2/swagger.json), nejvýš 4 dotazy za sekundu.
const URL = "https://api.hlidacstatu.cz/api/v2/vz/hledat";

function first<T>(...vals: T[]): T | undefined {
  return vals.find((v) => v !== undefined && v !== null && (v as any) !== "");
}
const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);

export async function fetchHlidac(opts: {
  keywords: string[];
  days: number;
  kind: Tender["kind"];
}): Promise<Tender[]> {
  const token = process.env.HLIDAC_TOKEN;
  if (!token || !opts.keywords.length) return [];

  const since = new Date(Date.now() - opts.days * 86400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Map<string, Tender>();

  for (const kw of opts.keywords.slice(0, 8)) {
    const early = opts.kind === "upcoming" ? `"tržní konzultace" AND ` : "";
    const q = new URLSearchParams({ dotaz: `${early}${kw}`, zverejnenoOd: since, strana: "1", razeni: "1" });
    // nejvýš 4 dotazy za sekundu (a otevřené i připravované běží souběžně) – mezi dotazy pauza,
    // při 429 jednou počkat a zkusit znovu
    const get = () =>
      fetch(`${URL}?${q}`, {
        headers: { Authorization: `Token ${token}`, "User-Agent": "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
    await new Promise((r) => setTimeout(r, 600));
    let res = await get();
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2500));
      res = await get();
    }
    if (!res.ok) throw new Error(`Hlídač státu ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const rows: any[] = data.results ?? data.Results ?? [];
    for (const r of rows) {
      const id = String(first(r.id, r.Id) ?? "");
      if (!id || seen.has(`hs-${id}`)) continue;
      const s = r.souhrn ?? {};
      const deadline = day(first(s.lhutaDoruceni, s.lhutaPrihlaseni));
      if (opts.kind === "open" && deadline && deadline < today) continue;
      const value = Number(first(s.predpokladanaHodnotaBezDPH, r.predpokladanaHodnotaBezDPHVCZK, s.konecnaHodnotaBezDPH));
      seen.set(`hs-${id}`, {
        id: `hs-${id}`,
        source: "Hlídač státu",
        kind: opts.kind,
        title: first(r.nazevVerejneZakazky) ?? "(bez názvu)",
        buyer: first(s.nazevZadavatele) ?? "",
        published: day(s.datumUverejneni),
        deadline,
        value: Number.isFinite(value) && value > 0 ? value : null,
        currency: value ? (s.mena ?? "CZK") : null,
        cpv: (s.cpvKody ?? []).filter((c: unknown) => typeof c === "string"),
        description: String(first(r.predmet?.popisPredmetu) ?? "").slice(0, 1500),
        url: `https://www.hlidacstatu.cz/verejnezakazky/zakazka/${id}`,
      });
    }
  }
  return [...seen.values()];
}
