import type { Tender } from "../types";
import { hlidacGet } from "../hlidac-api";

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
    // fronta s limitem dotazů; stejný dotaz se hodinu bere z paměti
    const data = await hlidacGet(`${URL}?${q}`, 3600);
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
