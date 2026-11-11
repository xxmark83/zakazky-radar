import { readFileSync } from "node:fs";
import path from "node:path";
import type { Tender } from "../types";
import { matcher } from "../match";

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
type Data = { updated: string; profiles: number; ok: number; never?: number; tenders: Row[] };

const read = (name: string) => {
  try {
    return readFileSync(path.join(process.cwd(), "data", name), "utf8");
  } catch {
    return "";
  }
};
const key = (t: Row) => `${t.title.toLowerCase().replace(/\s+/g, " ")}|${t.buyer.toLowerCase()}`;

// k profilům přidáme zakázky z RSS Vhodného uveřejnění (scripts/vhodne.mjs), bez těch, které už známe z profilu
let cache: { size: string; data: Data } | null = null;
function load(): Data | null {
  const raw = read("profily.json");
  const vu = read("vhodne.json");
  if (!raw) return null;
  const size = `${raw.length}/${vu.length}`;
  if (cache?.size === size) return cache.data;
  try {
    const data: Data = JSON.parse(raw);
    if (vu) {
      const known = new Set(data.tenders.map(key));
      // zakázky bez detailu (zadavatel, lhůta) bereme jen 35 dní od zveřejnění, pak už většinou nejdou podat
      const old = new Date(Date.now() - 35 * 86400_000).toISOString().slice(0, 10);
      const extra = (JSON.parse(vu).tenders as (Row & { detail?: boolean })[]).filter(
        (t) => !known.has(key(t)) && (t.detail || (t.published ?? "") >= old),
      );
      data.tenders = [...data.tenders, ...extra];
    }
    cache = { size, data };
    return data;
  } catch {
    return null;
  }
}

export function profilyInfo() {
  const d = load();
  return d ? { updated: d.updated, profiles: d.profiles, ok: d.ok, never: d.never ?? null, open: d.tenders.length, mode: (d as { mode?: string }).mode ?? null } : null;
}

/** Aktuální podoba zakázek z profilů podle id – pro hlídání změn u sledovaných zakázek. */
export function profilyById(ids: string[]): Map<string, { title: string; deadline: string | null; description: string }> {
  const d = load();
  const want = new Set(ids);
  return new Map((d?.tenders ?? []).filter((t) => want.has(t.id)).map((t) => [t.id, t]));
}

const toTender = (t: Row): Tender => ({
  id: t.id,
  source: "Profily zadavatelů",
  kind: "open",
  title: t.title,
  buyer: t.buyer,
  published: t.published,
  deadline: t.deadline,
  value: null,
  currency: null,
  cpv: t.cpv && t.cpv !== "00000000" ? [t.cpv] : [],
  description: [t.regime, t.description].filter(Boolean).join(" – "),
  url: t.url,
});

export function fetchProfily(opts: { keywords: string[]; cpv: string[]; days: number }): Tender[] {
  const d = load();
  if (!d) return [];
  const hit = matcher(opts.keywords);
  // CPV je hierarchické: 72000000 pokrývá všechno, co začíná na 72
  const prefixes = opts.cpv.map((c) => c.replace(/0+$/, "")).filter((c) => c.length >= 2);
  const since = new Date(Date.now() - opts.days * 86400_000).toISOString().slice(0, 10);

  return d.tenders
    .filter((t) => !t.published || t.published >= since)
    .filter((t) => {
      return hit(`${t.title} ${t.description}`) || prefixes.some((p) => t.cpv.startsWith(p));
    })
    .map(toTender);
}

const bare = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Otevřené zakázky sledovaných zadavatelů (bez ohledu na klíčová slova). Shoda podle názvu bez diakritiky. */
export function profilyByBuyer(names: string[]): Tender[] {
  const d = load();
  const want = names.map(bare).filter((n) => n.length >= 4);
  if (!d || !want.length) return [];
  return d.tenders.filter((t) => want.includes(bare(t.buyer))).map(toTender);
}

/** Řádek z profilů k zakázce z jakéhokoli zdroje: podle id, kódu NEN nebo názvu a zadavatele (kvůli dokumentům). */
export function profilyRow(t: Tender): Row | null {
  const d = load();
  if (!d) return null;
  const nen = t.id.startsWith("nen-") ? `pz-${t.id.slice(4)}` : null;
  return (
    d.tenders.find((r) => r.id === t.id || r.id === nen) ??
    d.tenders.find((r) => r.id.startsWith("pz-") && key(r) === key({ ...r, title: t.title, buyer: t.buyer })) ??
    null
  );
}
