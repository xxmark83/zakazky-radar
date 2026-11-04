import type { Tender } from "../types";

// NEN (Národní elektronický nástroj, nen.nipez.cz) – státní nástroj, kde zadávají ministerstva, kraje,
// obce i malé zakázky. Oficiální API slouží jen k nákupu z e-katalogů, proto čteme veřejný seznam
// zakázek (HTML) s filtrem podle názvu. Zdarma, bez registrace.
const BASE = "https://nen.nipez.cz/verejne-zakazky";

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

// "09. 11. 2026 10:00" -> "2026-11-09"
const isoDate = (s: string) => {
  const m = s.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};

// NEN hledá podřetězec v názvu – celé fráze najdou málo, proto hledáme jednotlivá slova se zkrácenou
// koncovkou („zákaznick“ najde i „zákaznického“). Nesouvisející výsledky pak vyřadí AI.
const STOP = new Set(["pro", "správa", "systém", "zaměstnanců", "občany", "klientů", "kontaktů"]);
const ALWAYS = ["informační systém", "aplikac", "software"];
const terms = (keywords: string[]) => {
  const words = keywords
    .flatMap((k) => k.split(/\s+/))
    .filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()))
    .map((w) => (w.length >= 8 ? w.slice(0, -2) : w).toLowerCase());
  return [...new Set([...words, ...ALWAYS])].slice(0, 16);
};

async function page(term: string, n: number) {
  const url = `${BASE}/p:vz:nazev=${encodeURIComponent(term)}${n > 1 ? `&page=${n}` : ""}`;
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "zakazky-radar" } });
  if (!res.ok) throw new Error(`NEN ${res.status}`);
  const html = await res.text();
  const rows: string[][] = [];
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => decode(m[1]));
    if (cells.length >= 6 && /^N\d+\//.test(cells[1])) rows.push(cells);
  }
  return rows;
}

export async function fetchNen(opts: { keywords: string[] }): Promise<Tender[]> {
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Map<string, Tender>();

  // NEN při souběžných dotazech vrací 503 – ptáme se postupně a chybu jednoho slova přeskočíme
  const list = terms(opts.keywords);
  let failed = 0;
  for (const term of list) {
    try {
      for (const n of [1, 2]) {
        const rows = await page(term, n);
        // sloupce: Detail | Systémové číslo | Název | Stav | Zadavatel | Lhůta
        for (const [, code, title, state, buyer, lhuta] of rows) {
          const deadline = isoDate(lhuta);
          if (state !== "Neukončen" || (deadline && deadline < today)) continue;
          const id = `nen-${code}`;
          if (seen.has(id)) continue;
          seen.set(id, {
            id,
            source: "NEN",
            kind: "open",
            title,
            buyer,
            published: null,
            deadline,
            value: null,
            currency: null,
            cpv: [],
            description: "",
            url: `${BASE}/detail-zakazky/${code.replace(/\//g, "-")}`,
          });
        }
        if (rows.length < 50) break;
      }
    } catch {
      failed++;
    }
  }
  if (failed === list.length) throw new Error("NEN neodpovídá");
  return [...seen.values()];
}
