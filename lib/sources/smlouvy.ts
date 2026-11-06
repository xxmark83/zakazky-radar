import { readFileSync } from "node:fs";
import path from "node:path";
import type { Award } from "../types";

// IT smlouvy z Registru smluv (i bez soutěže, nad 50 tis. Kč). Soubor plní scripts/smlouvy.mjs.
type Row = Award & { buyerIco: string | null; winnerIco: string[]; version: number };

let cache: { size: number; data: { updated: string; contracts: Row[] } } | null = null;
function load() {
  try {
    const raw = readFileSync(path.join(process.cwd(), "data/smlouvy-it.json"), "utf8");
    if (!cache || cache.size !== raw.length) cache = { size: raw.length, data: JSON.parse(raw) };
    return cache.data;
  } catch {
    return null;
  }
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const toAward = ({ buyerIco, winnerIco, version, ...a }: Row): Award => ({ ...a, cpv: [], source: "Smlouvy" });

export function smlouvyInfo() {
  const d = load();
  return d ? { updated: d.updated, count: d.contracts.length } : null;
}

/** Smlouvy podle slov v předmětu (registr nemá CPV). */
export function smlouvyAwards(opts: { keywords: string[]; days: number }): Award[] {
  const d = load();
  const words = opts.keywords.map(norm).filter((w) => w.length >= 3);
  if (!d || !words.length) return [];
  const since = new Date(Date.now() - opts.days * 86400_000).toISOString().slice(0, 10);
  return d.contracts
    .filter((c) => (!c.published || c.published >= since) && words.some((w) => ` ${norm(c.title)} `.includes(w)))
    .map(toAward);
}

export function smlouvyByWinner(name: string, days = 1825): Award[] {
  const d = load();
  if (!d) return [];
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const want = norm(name.replace(/,?\s*(spol\.\s*s\s*r\.\s*o\.|s\.\s*r\.\s*o\.|a\.\s*s\.|v\.\s*o\.\s*s\.|k\.\s*s\.|z\.\s*s\.|s\.\s*p\.|se)\s*$/i, ""));
  if (want.length < 3) return [];
  return d.contracts.filter((c) => (!c.published || c.published >= since) && c.winners.some((w) => norm(w).includes(want))).map(toAward);
}
