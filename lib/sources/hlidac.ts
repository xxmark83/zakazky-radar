import type { Tender } from "../types";

// Hlídač státu – agreguje i podlimitní zakázky z profilů zadavatelů a Věstníku.
// Token zdarma po registraci (nekomerční užití; komerční dle jejich podmínek).
const URL = "https://api.hlidacstatu.cz/api/v2/verejnezakazky/hledat";

function first<T>(...vals: T[]): T | undefined {
  return vals.find((v) => v !== undefined && v !== null && (v as any) !== "");
}

export async function fetchHlidac(opts: {
  keywords: string[];
  days: number;
  kind: Tender["kind"];
}): Promise<Tender[]> {
  const token = process.env.HLIDAC_TOKEN;
  if (!token || !opts.keywords.length) return [];

  const since = new Date(Date.now() - opts.days * 86400_000).toISOString().slice(0, 10);
  const seen = new Map<string, Tender>();

  for (const kw of opts.keywords.slice(0, 8)) {
    const early = opts.kind === "upcoming" ? `"tržní konzultace" AND ` : "";
    const dotaz = `${early}${kw} AND zverejneno:[${since} TO *]`;
    const res = await fetch(`${URL}?dotaz=${encodeURIComponent(dotaz)}&strana=1`, {
      headers: { Authorization: `Token ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Hlídač státu ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const rows: any[] = data.Results ?? data.results ?? [];
    for (const r of rows) {
      const id = String(first(r.Id, r.id) ?? "");
      if (!id || seen.has(id)) continue;
      const value = Number(first(r.OdhadovanaHodnotaBezDPH, r.KonecnaHodnotaBezDPH));
      const urls: string[] = r.UrlZakazky ?? [];
      seen.set(id, {
        id: `hs-${id}`,
        source: "Hlídač státu",
        kind: opts.kind,
        title: first(r.NazevZakazky, r.nazevZakazky) ?? "(bez názvu)",
        buyer: first(r.Zadavatel?.Jmeno, r.zadavatel?.jmeno) ?? "",
        published: (first(r.DatumUverejneni, r.datumUverejneni) ?? "").slice(0, 10) || null,
        deadline: (first(r.LhutaDoruceni, r.lhutaDoruceni) ?? "").slice(0, 10) || null,
        value: Number.isFinite(value) && value > 0 ? value : null,
        currency: value ? "CZK" : null,
        cpv: (r.CPV ?? []).map((c: any) => (typeof c === "string" ? c : c.Kod)).filter(Boolean),
        description: String(first(r.PopisZakazky, r.popisZakazky) ?? "").slice(0, 1500),
        url: urls[0] ?? `https://www.hlidacstatu.cz/verejnezakazky/zakazka/${id}`,
      });
    }
  }
  return [...seen.values()];
}
