import { readFileSync } from "node:fs";
import path from "node:path";
import type { Award } from "../types";

// Výsledky řízení z otevřených dat ISVZ (i podlimitní zakázky, cena smlouvy, počet nabídek).
// Soubor jednou měsíčně obnovuje GitHub Actions (scripts/isvz.mjs), tady ho jen filtrujeme.
type Row = Award & { buyerIco: string | null; winnerIco: (string | null)[]; nuts: string | null };
type Data = { updated: string; cpv: string[]; months: string[]; awards: Row[] };

let cache: { size: number; data: Data } | null = null;
function load(): Data | null {
  try {
    const raw = readFileSync(path.join(process.cwd(), "data/isvz-vysledky.json"), "utf8");
    if (!cache || cache.size !== raw.length) cache = { size: raw.length, data: JSON.parse(raw) };
    return cache.data;
  } catch {
    return null;
  }
}

export function isvzInfo() {
  const d = load();
  return d ? { months: d.months, count: d.awards.length, cpv: d.cpv } : null;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// krátké zkratky (SOC, EDR, NIS2) jen jako celé slovo, jinak by „soc“ našlo i „sociální“
const hit = (title: string, w: string) => ` ${norm(title)} `.includes(w.length <= 4 ? ` ${w} ` : w);
const toAward = ({ buyerIco, winnerIco, nuts, ...a }: Row): Award => ({ ...a, source: "ISVZ" });

export function isvzAwards(opts: { cpv: string[]; keywords: string[]; days: number }): Award[] {
  const d = load();
  if (!d) return [];
  const since = new Date(Date.now() - opts.days * 86400_000).toISOString().slice(0, 10);
  const prefixes = opts.cpv.map((c) => c.replace(/0+$/, "")).filter((c) => c.length >= 2);
  const words = opts.keywords.map(norm).filter((w) => w.length >= 3);
  return d.awards
    .filter((a) => !a.published || a.published >= since)
    .filter((a) => {
      const cpvOk = !prefixes.length || a.cpv.some((c) => prefixes.some((p) => c.startsWith(p)));
      const kwOk = !words.length || words.some((w) => hit(a.title, w));
      return cpvOk && kwOk;
    })
    .map(toAward);
}

/** Výhry firmy podle názvu (bez právní formy) nebo IČO. */
export function isvzByWinner(name: string, days = 1825): Award[] {
  const d = load();
  if (!d) return [];
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const want = norm(name.replace(/,?\s*(spol\.\s*s\s*r\.\s*o\.|s\.\s*r\.\s*o\.|a\.\s*s\.|v\.\s*o\.\s*s\.|k\.\s*s\.|z\.\s*s\.|s\.\s*p\.|se)\s*$/i, ""));
  if (want.length < 3) return [];
  return d.awards
    .filter((a) => (!a.published || a.published >= since) && a.winners.some((w) => norm(w).includes(want)))
    .map(toAward);
}

/** Stejné řízení bývá ve více zdrojích – necháme první (ISVZ má cenu smlouvy a počet nabídek). */
export function mergeAwards(...lists: Award[][]): Award[] {
  const key = (a: Award) => `${norm(a.title).slice(0, 40)}|${norm(a.buyer).slice(0, 12)}`;
  const seen = new Set<string>();
  return lists.flat().filter((a) => {
    const k = key(a);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
