import type { Tender } from "../types";

// TED (Tenders Electronic Daily) – oficiální, bezplatné API EU, bez klíče.
// Obsahuje české zakázky nad evropským limitem (cca od 3–5 mil. Kč).
const TED_URL = "https://api.ted.europa.eu/v3/notices/search";

const FIELDS = [
  "publication-number",
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

type LangMap = Record<string, string | string[]> | undefined;

function pickLang(v: LangMap): string {
  if (!v) return "";
  const val = v.ces ?? v.eng ?? Object.values(v)[0];
  return Array.isArray(val) ? val.join(" | ") : (val ?? "");
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

export async function fetchTed(opts: { cpv: string[]; days: number; max?: number }): Promise<Tender[]> {
  const since = new Date(Date.now() - opts.days * 86400_000);
  const parts = [
    "buyer-country=CZE",
    `publication-date>=${ymd(since)}`,
    // výzvy k podání nabídek (ne výsledky)
    "notice-type IN (cn-standard cn-social cn-desg pin-cfc-standard pin-cfc-social)",
  ];
  if (opts.cpv.length) parts.push(`classification-cpv IN (${opts.cpv.join(" ")})`);
  const query = parts.join(" AND ");

  const max = opts.max ?? 500;
  const out: Tender[] = [];
  for (let page = 1; out.length < max; page++) {
    const res = await fetch(TED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, fields: FIELDS, limit: 100, page, scope: "ALL" }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`TED ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const notices: any[] = data.notices ?? [];
    for (const n of notices) {
      const id = n["publication-number"];
      const deadlines: string[] = n["deadline-receipt-tender-date-lot"] ?? [];
      const value = Number(n["estimated-value-proc"]);
      out.push({
        id: `ted-${id}`,
        source: "TED",
        title: pickLang(n["title-proc"]) || pickLang(n["notice-title"]),
        buyer: pickLang(n["buyer-name"]),
        published: (n["publication-date"] ?? "").slice(0, 10) || null,
        deadline: deadlines.length ? deadlines.sort()[0].slice(0, 10) : null,
        value: Number.isFinite(value) && value > 0 ? value : null,
        currency: n["estimated-value-cur-proc"] ?? null,
        cpv: Array.from(new Set<string>(n["classification-cpv"] ?? [])),
        description: (pickLang(n["description-proc"]) || pickLang(n["description-lot"])).slice(0, 1500),
        url: `https://ted.europa.eu/cs/notice/-/detail/${id}`,
      });
    }
    if (notices.length < 100) break;
  }
  return out;
}
