import { fetchHlidac } from "./sources/hlidac";
import { fetchNen } from "./sources/nen";
import { fetchDns } from "./sources/dns";
import { fetchProfily, profilyInfo } from "./sources/profily";
import { fetchTedOpen, fetchTedUpcoming } from "./sources/ted";
import { pickModel } from "./ai";
import { profileKey, richness, stale } from "./profile-key";
import { aiBudgetLeft } from "./budget";
import { scoreTenders } from "./score";
import { assignIds, canonFields, cluster } from "./dedupe";
import { addSpend, getCanon, getScores, saveCanon, saveScores } from "./store";
import type { Score, ScoredTender, SearchRequest, Tender } from "./types";

export const splitList = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export const parseCpv = (s: string) => s.split(/[\s,;]+/).filter((c) => /^\d{8}$/.test(c));

export type SearchResult = {
  total: number;
  open: number;
  scored: number; // kolik zakázek AI hodnotila teď
  cached: number; // kolik skóre se vzalo z minula
  cost: number; // cena AI hodnocení v USD
  newScores: Record<string, Score>; // nová skóre všech zakázek (i pod limitem), klient si je zapamatuje
  warnings: string[];
  sources: SourceReport[]; // co který zdroj vrátil a jestli úplně
  results: ScoredTender[];
};

// Úplnost zdroje: error = zdroj selhal celý, partial = vrátil jen část (došel čas, selhala slova, stará data),
// off = zdroj je vypnutý (chybí klíč). Bez toho vypadá „prohledali jsme jen část“ stejně jako „nic nového“.
export type SourceReport = { name: string; count: number | null; error?: string; partial?: string; off?: string };

// průběh hledání pro appku: který zdroj je hotový a kolik dávek AI už ohodnotila
export type SearchProgress =
  | { step: "source"; name: string; count: number | null; error?: string; partial?: string }
  | { step: "ai"; fresh: number; cached: number }
  | { step: "batch"; done: number; all: number };

export async function runSearch(body: SearchRequest, onProgress?: (p: SearchProgress) => void): Promise<SearchResult> {
  const days = Math.min(Math.max(Number(body.days) || 30, 1), 365);
  const cpv = parseCpv(body.cpv);
  const keywords = splitList(body.keywords);
  const kind = body.mode === "upcoming" ? "upcoming" : "open";
  const warnings: string[] = [];

  // NEN nemá předběžná oznámení, hledá se jen u otevřených zakázek
  const sources: [string, Promise<Tender[]>][] = [
    ["TED", (kind === "upcoming" ? fetchTedUpcoming : fetchTedOpen)({ cpv, keywords, days, countries: body.slovakia ? ["CZE", "SVK"] : ["CZE"] })],
    ["NEN", kind === "open" ? fetchNen({ keywords, budgetMs: body.nenBudgetMs }) : Promise.resolve([])],
    ["Hlídač státu", fetchHlidac({ keywords, days, kind })],
    ["Profily zadavatelů", Promise.resolve(kind === "open" ? fetchProfily({ keywords, cpv, days }) : [])],
    // DNS běží roky, takže se nefiltrují podle data zveřejnění
    ["DNS", Promise.resolve(kind === "open" ? fetchDns({ keywords, cpv }) : [])],
  ];
  // stažená data profilů starší než 30 hodin = noční sběr neproběhl; výsledek z nich je jen částečný
  const pi = kind === "open" ? profilyInfo() : null;
  const staleProfily = pi && Date.now() - Date.parse(pi.updated) > 30 * 3600_000 ? `data jsou z ${new Date(pi.updated).toLocaleDateString("cs-CZ")}, noční sběr od té doby neproběhl` : undefined;
  const partialOf = (name: string, list: Tender[]) => (list as Tender[] & { partial?: string }).partial ?? (name === "Profily zadavatelů" ? staleProfily : undefined);
  const settled = await Promise.allSettled(
    sources.map(([name, p]) =>
      p.then(
        (list) => (onProgress?.({ step: "source", name, count: list.length, partial: partialOf(name, list) }), list),
        (e) => {
          onProgress?.({ step: "source", name, count: null, error: String(e?.message ?? e) });
          throw e;
        },
      ),
    ),
  );
  const tenders: Tender[] = [];
  const report: SourceReport[] = [];
  settled.forEach((r, i) => {
    const name = sources[i][0];
    if (r.status === "fulfilled") {
      tenders.push(...r.value);
      const partial = partialOf(name, r.value);
      const off = name === "Hlídač státu" && !process.env.HLIDAC_TOKEN ? "vypnuto – chybí licence (HLIDAC_TOKEN)" : undefined;
      report.push({ name, count: r.value.length, partial, off });
      if (partial) warnings.push(`${name}: částečné výsledky – ${partial}.`);
    } else {
      const error = String(r.reason?.message ?? r.reason);
      report.push({ name, count: null, error });
      warnings.push(`${name}: ${error}`);
    }
  });

  // u otevřených zahodit prošlou lhůtu; připravované lhůtu obvykle nemají.
  // Stejná zakázka bývá ve více zdrojích (TED, NEN i profil zadavatele): záznamy se spojí do jednoho
  // a zakázka si drží id, pod kterým se ukázala poprvé (lib/dedupe.ts).
  const today = new Date().toISOString().slice(0, 10);
  const clusters = cluster(tenders.filter((t) => !t.deadline || t.deadline >= today));
  const canon = await getCanon([...new Set(clusters.flat().flatMap(canonFields))]).catch(() => ({}));
  const { tenders: open, save } = assignIds(clusters, canon);
  await saveCanon(save).catch(() => {});

  // co už AI s tímto profilem hodnotila (v prohlížeči nebo v databázi), se znovu neposílá
  const key = profileKey(body.profile);
  const saved: Record<string, Score> = await getScores(key, open.map((t) => t.id)).catch(() => ({}));
  // paměť prohlížeče má přednost, ale údaj „r“ (s čím AI hodnotila) si bere z databáze, když ho sama nemá
  const known: Record<string, Score> = { ...saved };
  for (const [id, s] of Object.entries(body.known ?? {})) known[id] = { ...s, r: s.r ?? saved[id]?.r };
  // zakázka, která od hodnocení dostala znatelně bohatší popis (hodnotu, CPV), jde k AI znovu
  const fresh = open.filter((t) => !known[t.id] || stale(known[t.id], t));
  // starším skóre bez „r“ ho doplníme podle dnešní podoby, ať se příští obohacení pozná
  const backfill: Record<string, Score> = Object.fromEntries(
    open.filter((t) => saved[t.id] && saved[t.id].r === undefined).map((t) => [t.id, { ...saved[t.id], r: richness(t) }]),
  );
  // měsíční limit hlídá server: prohlížeč ani ranní běh ho neobejdou
  const noAi = Boolean(body.noAi) || !(await aiBudgetLeft());
  onProgress?.({ step: "ai", fresh: process.env.ANTHROPIC_API_KEY && !noAi ? fresh.length : 0, cached: open.length - fresh.length });
  const unscored = (t: Tender): ScoredTender => ({ ...t, score: -1, product: "–", reason: "" });

  let scored = new Map<string, ScoredTender>();
  let cost = 0;
  if (!process.env.ANTHROPIC_API_KEY) {
    warnings.push("Chybí ANTHROPIC_API_KEY – nové zakázky jsou bez AI hodnocení.");
  } else if (noAi) {
    if (fresh.length) warnings.push(`Měsíční limit za AI je vyčerpaný – ${fresh.length} nových zakázek je bez hodnocení.`);
  } else if (fresh.length) {
    const r = await scoreTenders(body.profile, fresh, pickModel(body.model), (done, all) => onProgress?.({ step: "batch", done, all }));
    scored = new Map(r.tenders.map((t) => [t.id, t]));
    cost = r.cost;
    if (r.failed) warnings.push(`AI hodnocení zčásti selhalo (${r.error}) – ${r.failed} zakázek je bez hodnocení, příští hledání je zkusí znovu.`);
    if (r.skipped > 0) warnings.push(`AI nevrátila hodnocení u ${r.skipped} zakázek – příští hledání je zkusí znovu.`);
  }

  // kraj z oficiálních dat (TED) má přednost před odhadem AI
  const all = open.map((t) => {
    const s = scored.get(t.id) ?? (known[t.id] ? { ...t, ...known[t.id] } : unscored(t));
    return t.region ? { ...s, region: t.region } : s;
  });
  const results = all
    .filter((t) => t.score < 0 || t.score >= (body.minScore ?? 0))
    .sort((a, b) => b.score - a.score);
  const newScores: Record<string, Score> = Object.fromEntries(
    // nehodnocené (-1) se neukládají, ať je příští hledání pošle AI znovu
    [...scored.values()].filter((t) => t.score >= 0).map((t) => [t.id, { score: t.score, product: t.product, reason: t.reason, region: t.region, r: richness(t) }]),
  );
  await Promise.all([saveScores(key, { ...backfill, ...newScores }), addSpend(cost)]).catch(() => {});
  return {
    total: tenders.length,
    open: open.length,
    scored: Object.keys(newScores).length,
    cached: open.length - fresh.length,
    cost,
    newScores,
    warnings,
    sources: report,
    results,
  };
}
