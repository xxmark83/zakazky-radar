import { fetchHlidac } from "./sources/hlidac";
import { fetchNen } from "./sources/nen";
import { fetchProfily } from "./sources/profily";
import { fetchTedOpen, fetchTedUpcoming } from "./sources/ted";
import { scoreTenders } from "./score";
import type { ScoredTender, SearchRequest, Tender } from "./types";

export const splitList = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export const parseCpv = (s: string) => s.split(/[\s,;]+/).filter((c) => /^\d{8}$/.test(c));

export type SearchResult = { total: number; open: number; warnings: string[]; results: ScoredTender[] };

export async function runSearch(body: SearchRequest): Promise<SearchResult> {
  const days = Math.min(Math.max(Number(body.days) || 30, 1), 365);
  const cpv = parseCpv(body.cpv);
  const keywords = splitList(body.keywords);
  const kind = body.mode === "upcoming" ? "upcoming" : "open";
  const warnings: string[] = [];

  // NEN nemá předběžná oznámení, hledá se jen u otevřených zakázek
  const sources: [string, Promise<Tender[]>][] = [
    ["TED", kind === "upcoming" ? fetchTedUpcoming({ cpv, days }) : fetchTedOpen({ cpv, days })],
    ["NEN", kind === "open" ? fetchNen({ keywords }) : Promise.resolve([])],
    ["Hlídač státu", fetchHlidac({ keywords, days, kind })],
    ["Profily zadavatelů", Promise.resolve(kind === "open" ? fetchProfily({ keywords, cpv, days }) : [])],
  ];
  const settled = await Promise.allSettled(sources.map(([, p]) => p));
  const tenders: Tender[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") tenders.push(...r.value);
    else warnings.push(`${sources[i][0]}: ${r.reason?.message ?? r.reason}`);
  });

  // u otevřených zahodit prošlou lhůtu; připravované lhůtu obvykle nemají.
  // Stejná zakázka bývá ve více zdrojích (TED, NEN i profil zadavatele) – necháme první výskyt.
  const today = new Date().toISOString().slice(0, 10);
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const seen = new Set<string>();
  const open = tenders.filter((t) => {
    if (t.deadline && t.deadline < today) return false;
    const key = `${norm(t.title)}|${norm(t.buyer).slice(0, 12)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!process.env.ANTHROPIC_API_KEY) {
    warnings.push("Chybí ANTHROPIC_API_KEY – zobrazuji zakázky bez AI hodnocení.");
    return {
      total: tenders.length,
      open: open.length,
      warnings,
      results: open.map((t) => ({ ...t, score: -1, product: "–", reason: "" })),
    };
  }

  const scored = await scoreTenders(body.profile, open);
  const results = scored.filter((t) => t.score >= (body.minScore ?? 0)).sort((a, b) => b.score - a.score);
  return { total: tenders.length, open: open.length, warnings, results };
}
