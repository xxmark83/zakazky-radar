import { isvzByWinner } from "./sources/isvz";
import { profilyByBuyer } from "./sources/profily";
import { smlouvyByWinner } from "./sources/smlouvy";
import { fetchTedByWinner } from "./sources/ted";
import type { WatchedBuyer, WatchedCompetitor } from "./store";
import type { Award, ScoredTender, Tender } from "./types";

// Nové zakázky sledovaných zadavatelů: z profilů zadavatelů a Vhodného uveřejnění (podle názvu)
// a s tokenem i z Hlídače státu (podle IČO, zachytí i NEN a Věstník).
const day = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);

async function hlidacByIco(ico: string, since: string): Promise<Tender[]> {
  const token = process.env.HLIDAC_TOKEN;
  if (!token) return [];
  const q = new URLSearchParams({ ico, zverejnenoOd: since, strana: "1", razeni: "1" });
  const res = await fetch(`https://api.hlidacstatu.cz/api/v2/vz/hledat?${q}`, {
    headers: { Authorization: `Token ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const today = new Date().toISOString().slice(0, 10);
  const rows: any[] = (await res.json()).results ?? [];
  return rows
    .map((r): Tender => {
      const s = r.souhrn ?? {};
      return {
        id: `hs-${r.id}`,
        source: "Hlídač státu",
        kind: "open",
        title: r.nazevVerejneZakazky ?? "(bez názvu)",
        buyer: s.nazevZadavatele ?? "",
        published: day(s.datumUverejneni),
        deadline: day(s.lhutaDoruceni ?? s.lhutaPrihlaseni),
        value: Number(s.predpokladanaHodnotaBezDPH) || null,
        currency: s.predpokladanaHodnotaBezDPH ? (s.mena ?? "CZK") : null,
        cpv: (s.cpvKody ?? []).filter((c: unknown) => typeof c === "string"),
        description: String(r.predmet?.popisPredmetu ?? "").slice(0, 1500),
        url: `https://www.hlidacstatu.cz/verejnezakazky/zakazka/${r.id}`,
      };
    })
    .filter((t) => t.deadline && t.deadline >= today); // jen ty, do kterých se dá ještě podat nabídka
}

/** Otevřené zakázky sledovaných zadavatelů, nejnovější první. Skóre -1 = AI je nehodnotila. */
export async function buyerTenders(buyers: WatchedBuyer[]): Promise<ScoredTender[]> {
  if (!buyers.length) return [];
  const since = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const lists = await Promise.all([
    Promise.resolve(profilyByBuyer(buyers.map((b) => b.name))),
    ...buyers.filter((b) => b.ico).map((b) => hlidacByIco(b.ico!, since).catch(() => [])),
  ]);
  const seen = new Set<string>();
  return lists
    .flat()
    .filter((t) => {
      const k = `${t.title.toLowerCase()}|${t.deadline}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))
    .map((t) => ({ ...t, score: -1, reason: "", product: "" }));
}

/** Čerstvé výhry a smlouvy sledovaných konkurentů (TED, Registr smluv, ISVZ) za posledních `days` dní. */
export async function competitorWins(list: WatchedCompetitor[], days = 14): Promise<{ name: string; awards: Award[] }[]> {
  const out = await Promise.all(
    list.map(async (c) => {
      const ted = await fetchTedByWinner(c.name, days).catch(() => []);
      const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
      const all = [...ted, ...smlouvyByWinner(c.name, days), ...isvzByWinner(c.name, days)].filter(
        (a) => !a.published || a.published >= since,
      );
      const seen = new Set<string>();
      const awards = all.filter((a) => {
        const k = `${a.title.toLowerCase()}|${a.buyer.toLowerCase()}`;
        return !seen.has(k) && Boolean(seen.add(k));
      });
      return { name: c.name, awards };
    }),
  );
  return out.filter((x) => x.awards.length);
}
