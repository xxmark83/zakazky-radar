import type { Region } from "../regions";
import type { Award, Tender } from "../types";

// TED (Tenders Electronic Daily) – oficiální, bezplatné API EU, bez klíče.
// Obsahuje české (a volitelně slovenské) zakázky nad evropským limitem (cca od 3–5 mil. Kč).
const TED_URL = "https://api.ted.europa.eu/v3/notices/search";

// Česko je vždy, Slovensko jen když ho uživatel zapne v Nastavení
export type Country = "CZE" | "SVK";

// kraj zadavatele podle kódu NUTS 3 (CZ064 = Jihomoravský)
const NUTS: Record<string, Region> = {
  CZ010: "Praha",
  CZ020: "Středočeský",
  CZ031: "Jihočeský",
  CZ032: "Plzeňský",
  CZ041: "Karlovarský",
  CZ042: "Ústecký",
  CZ051: "Liberecký",
  CZ052: "Královéhradecký",
  CZ053: "Pardubický",
  CZ063: "Vysočina",
  CZ064: "Jihomoravský",
  CZ071: "Olomoucký",
  CZ072: "Zlínský",
  CZ080: "Moravskoslezský",
};
function region(n: any, country: "CZ" | "SK"): Region | undefined {
  if (country === "SK") return "Slovensko";
  const codes: string[] = [...(n["organisation-country-sub-buyer"] ?? []), ...(n["place-of-performance-subdiv-lot"] ?? [])];
  for (const c of codes) if (NUTS[c.slice(0, 5)]) return NUTS[c.slice(0, 5)];
  return undefined;
}

const TENDER_FIELDS = [
  "publication-number",
  "buyer-country",
  "organisation-country-sub-buyer",
  "place-of-performance-subdiv-lot",
  "notice-type",
  "title-proc",
  "notice-title",
  "buyer-name",
  "publication-date",
  "deadline-receipt-tender-date-lot",
  "estimated-value-proc",
  "estimated-value-cur-proc",
  "classification-cpv",
  "description-lot",
  "description-proc",
];

const AWARD_FIELDS = [
  "publication-number",
  "title-proc",
  "notice-title",
  "buyer-name",
  "publication-date",
  "classification-cpv",
  "winner-name",
  "total-value",
  "total-value-cur",
];

type LangMap = Record<string, string | string[]> | undefined;

function pickLang(v: LangMap): string {
  if (!v) return "";
  const val = v.ces ?? v.slk ?? v.eng ?? Object.values(v)[0];
  return Array.isArray(val) ? val.join(" | ") : (val ?? "");
}

function pickLangList(v: LangMap): string[] {
  if (!v) return [];
  const val = v.ces ?? v.slk ?? v.eng ?? Object.values(v)[0];
  return Array.isArray(val) ? val : val ? [val] : [];
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

const noticeUrl = (id: string) => `https://ted.europa.eu/cs/notice/-/detail/${id}`;

// Fulltext TEDu: FT~("fráze")
function ftAny(keywords: string[]) {
  const terms = keywords.map((k) => `FT~("${k.replace(/"/g, "")}")`);
  return terms.length ? `(${terms.join(" OR ")})` : "";
}

async function search(query: string, fields: string[], max: number): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; out.length < max; page++) {
    const res = await fetch(TED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, fields, limit: 100, page, scope: "ALL" }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`TED ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const notices: any[] = data.notices ?? [];
    out.push(...notices);
    if (notices.length < 100) break;
  }
  return out.slice(0, max);
}

function toTender(n: any, kind: Tender["kind"]): Tender {
  const id = n["publication-number"];
  const deadlines: string[] = n["deadline-receipt-tender-date-lot"] ?? [];
  const value = Number(n["estimated-value-proc"]);
  const country = (n["buyer-country"] ?? []).includes("SVK") ? "SK" : "CZ";
  return {
    id: `ted-${id}`,
    source: "TED",
    country,
    region: region(n, country),
    kind,
    title: pickLang(n["title-proc"]) || pickLang(n["notice-title"]),
    buyer: pickLang(n["buyer-name"]),
    published: (n["publication-date"] ?? "").slice(0, 10) || null,
    deadline: deadlines.length ? [...deadlines].sort()[0].slice(0, 10) : null,
    value: Number.isFinite(value) && value > 0 ? value : null,
    currency: n["estimated-value-cur-proc"] ?? null,
    cpv: Array.from(new Set<string>(n["classification-cpv"] ?? [])),
    description: (pickLang(n["description-proc"]) || pickLang(n["description-lot"])).slice(0, 1500),
    url: noticeUrl(id),
  };
}

const base = (days: number, countries: Country[] = ["CZE"]) => [
  `buyer-country IN (${countries.join(" ")})`,
  `publication-date>=${ymd(new Date(Date.now() - days * 86400_000))}`,
];
const cpvPart = (cpv: string[]) => (cpv.length ? [`classification-cpv IN (${cpv.join(" ")})`] : []);

/** Otevřené výzvy k podání nabídek. */
export async function fetchTedOpen(opts: { cpv: string[]; days: number; countries?: Country[] }): Promise<Tender[]> {
  const query = [
    ...base(opts.days, opts.countries),
    "notice-type IN (cn-standard cn-social cn-desg pin-cfc-standard pin-cfc-social)",
    ...cpvPart(opts.cpv),
  ].join(" AND ");
  return (await search(query, TENDER_FIELDS, 500)).map((n) => toTender(n, "open"));
}

/** Připravované zakázky: předběžná oznámení (PIN) a předběžné tržní konzultace. */
export async function fetchTedUpcoming(opts: { cpv: string[]; days: number; countries?: Country[] }): Promise<Tender[]> {
  const early = `(notice-type IN (pin-only pin-buyer) OR FT~("tržní konzultace") OR FT~("tržních konzultací") OR FT~("prípravné trhové konzultácie"))`;
  const query = [...base(opts.days, opts.countries), early, ...cpvPart(opts.cpv)].join(" AND ");
  return (await search(query, TENDER_FIELDS, 300)).map((n) => toTender(n, "upcoming"));
}

/** Výsledky zadávacích řízení – kdo a za kolik vyhrál. */
export async function fetchTedAwards(opts: { cpv: string[]; keywords: string[]; days: number; countries?: Country[] }): Promise<Award[]> {
  const ft = ftAny(opts.keywords);
  const query = [
    ...base(opts.days, opts.countries),
    "notice-type IN (can-standard can-social)",
    ...cpvPart(opts.cpv),
    ...(ft ? [ft] : []),
  ].join(" AND ");
  const notices = await search(query, AWARD_FIELDS, 500);
  return notices.map(toAward);
}

function toAward(n: any): Award {
  const id = n["publication-number"];
  const value = Number(n["total-value"]);
  return {
    id: `ted-${id}`,
    title: pickLang(n["title-proc"]) || pickLang(n["notice-title"]),
    buyer: pickLang(n["buyer-name"]),
    published: (n["publication-date"] ?? "").slice(0, 10) || null,
    winners: Array.from(new Set(pickLangList(n["winner-name"]))),
    value: Number.isFinite(value) && value > 0 ? value : null,
    currency: (n["total-value-cur"] ?? [])[0] ?? null,
    cpv: Array.from(new Set<string>(n["classification-cpv"] ?? [])),
    url: noticeUrl(id),
  };
}

/** Všechny zakázky v ČR, které firma vyhrála (podle názvu vítěze v TED). */
export async function fetchTedByWinner(name: string, days = 1825, countries: Country[] = ["CZE"]): Promise<Award[]> {
  // právní formu vynecháme, TED ji píše různě (s.r.o., s. r. o., spol. s r.o.)
  const core = name
    .replace(/,?\s*(spol\.\s*s\s*r\.\s*o\.|s\.\s*r\.\s*o\.|a\.\s*s\.|v\.\s*o\.\s*s\.|k\.\s*s\.|z\.\s*s\.|s\.\s*p\.|se)\s*$/i, "")
    .replace(/["\\]/g, "")
    .trim();
  if (core.length < 3) return [];
  const query = [...base(days, countries), "notice-type IN (can-standard can-social)", `winner-name~"${core}"`].join(" AND ");
  const notices = await search(query, AWARD_FIELDS, 300);
  // hledání ~ je přibližné (najde i podobná jména), necháme jen výhry této firmy
  const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const want = norm(core);
  return notices
    .map(toAward)
    .filter((a) => a.winners.some((w) => norm(w).includes(want)))
    .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
}
