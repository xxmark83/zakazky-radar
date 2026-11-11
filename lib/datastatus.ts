import { readFileSync } from "node:fs";
import path from "node:path";
import { dnsInfo } from "./sources/dns";
import { isvzInfo } from "./sources/isvz";
import { profilyInfo } from "./sources/profily";
import { smlouvyInfo } from "./sources/smlouvy";

// Stav stažených dat: co je v appce, kdy se to naposled doplnilo a co se právě stahuje.
// Živé zdroje (TED, NEN, Hlídač státu) se nestahují dopředu – čtou se při každém hledání.
const UA = "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)";
const REPO = "xxmark83/zakazky-radar";

export type Dataset = {
  id: string;
  name: string;
  what: string; // co obsahuje
  count: string; // co je staženo
  updated: string | null;
  where: string; // kde a jak často se stahuje
  next: string | null; // ISO, kdy asi příště
  done?: number; // 0–1, když se ještě něco doplňuje
  pending?: string; // co ještě zbývá
  late?: boolean; // poslední běh se zpozdil
};

const fmt = (n: number) => n.toLocaleString("cs-CZ");
// příští běh podle denního plánu GitHub Actions (UTC)
function nextDaily(h: number, m: number) {
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}
const hoursAgo = (iso: string | null) => (iso ? (Date.now() - Date.parse(iso)) / 3600_000 : Infinity);

function vhodne() {
  try {
    const d = JSON.parse(readFileSync(path.join(process.cwd(), "data/vhodne.json"), "utf8")) as {
      updated: string;
      tenders: { detail?: boolean }[];
    };
    return { updated: d.updated, open: d.tenders.length, waiting: d.tenders.filter((t) => !t.detail).length };
  } catch {
    return null;
  }
}

export function datasets(): Dataset[] {
  const out: Dataset[] = [];
  const p = profilyInfo();
  if (p)
    out.push({
      id: "profily",
      name: "Profily zadavatelů",
      what: "E-ZAK, Tender arena, eGORDION, PROEBIZ a další",
      count: `${fmt(p.ok)} z ${fmt(p.profiles)} profilů prošlo, ${fmt(p.open)} otevřených zakázek`,
      updated: p.updated,
      where: "GitHub každou noc (asi 23:17)",
      next: nextDaily(22, 17),
      done: p.profiles ? p.ok / p.profiles : undefined,
      // většina „chybějících“ profilů má v úředním registru chybnou adresu (překlep, jen úvodní stránka portálu) –
      // ty se nestáhnou nikdy; dočasně nedostupné se zkouší znovu každou noc
      pending:
        p.profiles > p.ok
          ? p.never !== null
            ? [
                p.never ? `${fmt(p.never)} profilů má v registru chybnou adresu a stáhnout nejdou` : "",
                p.profiles - p.ok - p.never > 0 ? `${fmt(p.profiles - p.ok - p.never)} teď neodpovídá, zkusí se znovu příští noc` : "",
              ]
                .filter(Boolean)
                .join("; ")
            : `${fmt(p.profiles - p.ok)} profilů se nepodařilo stáhnout – většinou mají v registru chybnou adresu`
          : undefined,
      late: hoursAgo(p.updated) > 30,
    });
  const v = vhodne();
  if (v)
    out.push({
      id: "vhodne",
      name: "Vhodné uveřejnění",
      what: "asi 1 600 zadavatelů, hlavně obce",
      count: `${fmt(v.open)} otevřených zakázek`,
      updated: v.updated,
      where: "tvůj Mac každé 3 hodiny (jen když je zapnutý), 30 s mezi dotazy",
      next: new Date(Date.parse(v.updated) + 3 * 3600_000).toISOString(),
      done: v.open ? (v.open - v.waiting) / v.open : 1,
      pending: v.waiting ? `${fmt(v.waiting)} zakázek čeká na doplnění zadavatele a lhůty` : undefined,
      late: hoursAgo(v.updated) > 7,
    });
  const i = isvzInfo();
  if (i) {
    const months = i.months.length;
    const now = new Date();
    const want = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const wantYm = `${want.getFullYear()}-${String(want.getMonth() + 1).padStart(2, "0")}`;
    const nextMonth = now.getDate() >= 6 ? new Date(now.getFullYear(), now.getMonth() + 1, 6) : new Date(now.getFullYear(), now.getMonth(), 6);
    out.push({
      id: "isvz",
      name: "Výsledky zakázek (ISVZ)",
      what: "kdo vyhrál, za kolik a s kolika nabídkami",
      count: `${fmt(i.count)} výsledků za ${months} měsíců (${i.months[0]} až ${i.months.at(-1)})`,
      updated: i.updated,
      where: "tvůj Mac jednou měsíčně, od 6. dne (kdy vyjdou data za minulý měsíc)",
      next: nextMonth.toISOString(),
      pending: !i.months.includes(wantYm) && now.getDate() >= 6 ? `chybí ${wantYm}, stáhne se při dalším běhu Macu` : undefined,
      late: !i.months.includes(wantYm) && now.getDate() >= 8,
    });
  }
  const dn = dnsInfo();
  if (dn)
    out.push({
      id: "dns",
      name: "Dynamické nákupní systémy",
      what: "dlouhodobé systémy, kam se dá přihlásit kdykoli",
      count: `${fmt(dn.count)} systémů`,
      updated: dn.updated,
      where: "spolu s výsledky ISVZ",
      next: null,
    });
  const s = smlouvyInfo();
  if (s)
    out.push({
      id: "smlouvy",
      name: "Registr smluv (IT)",
      what: "IT smlouvy nad 50 tis. Kč za posledních 24 měsíců",
      count: `${fmt(s.count)} smluv`,
      updated: s.updated,
      where: "GitHub každé ráno (asi 4:53)",
      next: nextDaily(3, 53),
      late: hoursAgo(s.updated) > 30,
    });
  return out;
}

// právě běžící stahování na GitHubu (veřejné API, výsledek na 2 minuty v paměti)
let runsCache: { at: number; runs: { name: string; started: string; url: string }[] } | null = null;
export async function runningJobs() {
  if (runsCache && Date.now() - runsCache.at < 120_000) return runsCache.runs;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=10`, {
      headers: { "User-Agent": UA, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return runsCache?.runs ?? [];
    const d = (await res.json()) as { workflow_runs: { name: string; status: string; run_started_at: string; html_url: string; path: string }[] };
    const runs = d.workflow_runs
      .filter((r) => (r.status === "in_progress" || r.status === "queued") && /crawl|vhodne|isvz|smlouvy/.test(r.path))
      .map((r) => ({ name: r.name, started: r.run_started_at, url: r.html_url }));
    runsCache = { at: Date.now(), runs };
    return runs;
  } catch {
    return runsCache?.runs ?? [];
  }
}
