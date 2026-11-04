import { readFileSync } from "node:fs";
import path from "node:path";
import type { Tender } from "../types";
import { terms } from "./nen";

// Zakázky ze všech profilů zadavatelů v ČR (Tender arena, eGORDION, E-ZAK krajů a měst, Vhodné uveřejnění, …).
// Soubor každé ráno obnovuje GitHub Actions (scripts/crawl.mjs), tady ho jen filtrujeme.
type Row = {
  id: string;
  title: string;
  buyer: string;
  published: string | null;
  deadline: string | null;
  regime: string;
  cpv: string;
  description: string;
  url: string;
};
type Data = { updated: string; profiles: number; ok: number; tenders: Row[] };

let cache: { mtime: number; data: Data } | null = null;
function load(): Data | null {
  try {
    const file = path.join(process.cwd(), "data/profily.json");
    const raw = readFileSync(file, "utf8");
    if (!cache || cache.mtime !== raw.length) cache = { mtime: raw.length, data: JSON.parse(raw) };
    return cache.data;
  } catch {
    return null;
  }
}

export function profilyInfo() {
  const d = load();
  return d ? { updated: d.updated, profiles: d.profiles, ok: d.ok, open: d.tenders.length } : null;
}

export function fetchProfily(opts: { keywords: string[]; cpv: string[]; days: number }): Tender[] {
  const d = load();
  if (!d) return [];
  const words = terms(opts.keywords).map((w) => w.toLowerCase());
  // CPV je hierarchické: 72000000 pokrývá všechno, co začíná na 72
  const prefixes = opts.cpv.map((c) => c.replace(/0+$/, "")).filter((c) => c.length >= 2);
  const since = new Date(Date.now() - opts.days * 86400_000).toISOString().slice(0, 10);

  return d.tenders
    .filter((t) => !t.published || t.published >= since)
    .filter((t) => {
      const text = `${t.title} ${t.description}`.toLowerCase();
      return words.some((w) => text.includes(w)) || prefixes.some((p) => t.cpv.startsWith(p));
    })
    .map((t) => ({
      id: t.id,
      source: "Profily zadavatelů" as const,
      kind: "open" as const,
      title: t.title,
      buyer: t.buyer,
      published: t.published,
      deadline: t.deadline,
      value: null,
      currency: null,
      cpv: t.cpv && t.cpv !== "00000000" ? [t.cpv] : [],
      description: [t.regime, t.description].filter(Boolean).join(" – "),
      url: t.url,
    }));
}
