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

  // Hlídač státu počítá každý dotaz (zkušební přístup jich má jen 50, placený je také omezený), proto se hesla
  // neposílají po jednom, ale spojená přes OR po deseti: 43 hesel = 5 dotazů místo 43. Stránka má 25 zakázek,
  // nově zveřejněné první; druhá stránka jen když první nestačila. Stejný dotaz se 6 hodin bere z paměti.
  const rows: any[] = [];
  const words = [...new Set(opts.keywords.map((k) => k.replace(/["()]/g, "").trim()).filter(Boolean))].slice(0, 60);
  const early = opts.kind === "upcoming" ? `"tržní konzultace" AND ` : "";
  for (let i = 0; i < words.length; i += 10) {
    const any = words.slice(i, i + 10).map((k) => (k.includes(" ") ? `(${k})` : k)).join(" OR ");
    for (let page = 1; page <= 2; page++) {
      const q = new URLSearchParams({ dotaz: `${early}(${any})`, zverejnenoOd: since, strana: String(page), razeni: "1" });
      const data = await hlidacGet(`${URL}?${q}`, 6 * 3600);
      const part: any[] = data.results ?? data.Results ?? [];
      rows.push(...part);
      const total = Number(data.total ?? data.Total);
      if (part.length < 25 || (Number.isFinite(total) && total <= page * 25)) break;
    }
  }
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
  return [...seen.values()];
}
