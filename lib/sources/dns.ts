import { readFileSync } from "node:fs";
import path from "node:path";
import { matcher } from "../match";
import type { Tender } from "../types";

// Dynamické nákupní systémy z otevřených dat ISVZ: dodavatel se může přidat kdykoli po dobu trvání systému
// a pak dostává výzvy zadavatele. Soubor plní scripts/isvz.mjs.
type Dns = {
  id: string;
  title: string;
  buyer: string;
  nuts: string | null;
  started: string | null;
  end: string | null;
  cpv: string[];
  categories: string[];
  description: string;
  url: string;
};

let cache: { size: number; data: { updated: string; systems: Dns[] } } | null = null;
function load() {
  try {
    const raw = readFileSync(path.join(process.cwd(), "data/isvz-dns.json"), "utf8");
    if (!cache || cache.size !== raw.length) cache = { size: raw.length, data: JSON.parse(raw) };
    return cache.data;
  } catch {
    return null;
  }
}

export function dnsInfo() {
  const d = load();
  return d ? { updated: d.updated, count: d.systems.length } : null;
}

export function fetchDns(opts: { keywords: string[]; cpv: string[] }): Tender[] {
  const d = load();
  if (!d) return [];
  const today = new Date().toISOString().slice(0, 10);
  const hit = matcher(opts.keywords);
  const prefixes = opts.cpv.map((c) => c.replace(/0+$/, "")).filter((c) => c.length >= 2);
  return d.systems
    .filter((s) => !s.end || s.end >= today)
    .filter((s) => {
      return hit(`${s.title} ${s.description} ${s.categories.join(" ")}`) || s.cpv.some((c) => prefixes.some((p) => c.startsWith(p)));
    })
    .map((s) => ({
      id: s.id,
      source: "DNS" as const,
      kind: "open" as const,
      title: s.title,
      buyer: s.buyer,
      published: s.started,
      deadline: s.end,
      value: null,
      currency: null,
      cpv: s.cpv,
      description: [
        "Dynamický nákupní systém – přidat se lze kdykoli po dobu trvání, pak chodí výzvy k jednotlivým zakázkám.",
        s.description,
        s.categories.length ? `Kategorie: ${s.categories.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join(" "),
      url: s.url,
    }));
}
