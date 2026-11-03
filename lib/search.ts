import { fetchHlidac } from "./sources/hlidac";
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

  const [ted, hs] = await Promise.allSettled([
    kind === "upcoming" ? fetchTedUpcoming({ cpv, days }) : fetchTedOpen({ cpv, days }),
    fetchHlidac({ keywords, days, kind }),
  ]);
  const tenders: Tender[] = [];
  if (ted.status === "fulfilled") tenders.push(...ted.value);
  else warnings.push(`TED: ${ted.reason?.message ?? ted.reason}`);
  if (hs.status === "fulfilled") tenders.push(...hs.value);
  else warnings.push(`Hlídač státu: ${hs.reason?.message ?? hs.reason}`);
  if (!process.env.HLIDAC_TOKEN) warnings.push("Hlídač státu vypnutý (chybí HLIDAC_TOKEN) – podlimitní zakázky se nenačítají.");

  // u otevřených zahodit prošlou lhůtu; připravované lhůtu obvykle nemají
  const today = new Date().toISOString().slice(0, 10);
  const open = tenders.filter((t) => !t.deadline || t.deadline >= today);

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
