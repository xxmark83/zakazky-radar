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
// obecná slova z víceslovných hesel („GAP analýza“, „penetrační testy“) by našla stovky nesouvisejících zakázek;
// krátké zkratky jako SOC, EDR a GAP jsou podřetězcem běžných slov („sociální“, „nedrážní“), hledáme je jen přes TED a AI
const STOP = new Set([
  "pro", "správa", "systém", "zaměstnanců", "občany", "klientů", "kontaktů",
  "analýza", "testy", "bezpečnost", "soc", "iso", "edr", "xdr", "gap",
  "tvorba", "stránky", "míru", "online", "žádosti", "elektronické",
]);
const ALWAYS = ["informační systém", "aplikac", "software"];
export const terms = (keywords: string[]) => {
  const words = keywords
    .flatMap((k) => k.split(/\s+/))
    .filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase()))
    .map((w) => (w.length >= 8 ? w.slice(0, -2) : w).toLowerCase());
  // víc oblastí najednou = víc slov; NEN se ptáme postupně, 24 slov se vejde do limitu hledání.
  // Obecná IT slova jdou první, aby je limit nikdy neodřízl. (Naše stažená data limit nemají – lib/match.ts.)
  return [...new Set([...ALWAYS, ...words])].slice(0, 24);
};

// NEN umí filtr na stav přímo v adrese (stavZP=neukoncena). Bez něj je otevřená jen zhruba každá čtvrtá zakázka
// a u častých slov („software“ má 800 řádků) se na ty starší otevřené nedostalo. S filtrem má slovo obvykle
// jednu až dvě stránky po 50 a čteme je všechny. (Rozsah stránek page=2-6 nepoužíváme – za poslední stránkou
// vrací 404 nebo prázdnou kostru a někdy znovu první stránku.)
// Filtrované dotazy jsou rychlé (kolem 1 s) a NEN na dotazy těsně po sobě odpovídá 503 – držíme rozestup
// a 503 po chvíli zkusíme znovu, jinak by slovo tiše vypadlo.
const GAP_MS = 800;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastAt = 0;
async function get(url: string) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastAt + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    // status 0 = spojení spadlo (fetch failed) – zkusíme znovu stejně jako 503
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "zakazky-radar" } }).catch(() => null);
    lastAt = Date.now();
    if (res?.ok) return res.text();
    const status = res?.status ?? 0;
    if (process.env.NEN_DEBUG) console.warn("NEN", status, "pokus", attempt + 1);
    if ((status !== 503 && status !== 429 && status !== 0) || attempt >= 2) throw new Error(status ? `NEN ${status}` : "NEN neodpovídá");
    await sleep(3000 * (attempt + 1));
  }
}

const MAX_PAGES = 20; // 1000 otevřených zakázek na jedno slovo
async function page(term: string, n: number) {
  const url = `${BASE}/p:vz:nazev=${encodeURIComponent(term)}&stavZP=neukoncena${n > 1 ? `&page=${n}` : ""}`;
  const html = await get(url);
  const rows: string[][] = [];
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => decode(m[1]));
    if (cells.length >= 6 && /^N\d+\//.test(cells[1])) rows.push(cells);
  }
  const last = Math.max(1, ...[...html.matchAll(/[&;]page=(\d+)(?![\d-])/g)].map((m) => +m[1]));
  return { rows, last };
}

// Otevřená zakázka bez lhůty: v NEN jich visí stovky i několik let starých (nikdo je neuzavřel). Rok je v systémovém
// čísle (N006/26/V… = 2026) – bereme letošní a do konce dubna i loňské.
const fresh = (code: string, now: Date) => {
  const y = +(code.match(/^N\d+\/(\d{2})\//)?.[1] ?? NaN);
  if (Number.isNaN(y)) return true;
  const cur = now.getFullYear() % 100;
  return y >= cur || (y === cur - 1 && now.getMonth() < 4);
};

// budgetMs: jeden dotaz na NEN trvá 1–3 s včetně rozestupu, slovo stojí obvykle jeden až dva dotazy (24 slov kolem minuty).
// Po vyčerpání času vrátíme, co máme – stejné zakázky jsou i v denním sběru profilů (nen.nipez.cz/profil/…).
export async function fetchNen(opts: { keywords: string[]; budgetMs?: number }): Promise<Tender[]> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const stopAt = Date.now() + (opts.budgetMs ?? 90_000);
  const seen = new Map<string, Tender>();

  // NEN při souběžných dotazech vrací 503 – ptáme se postupně a chybu jednoho slova přeskočíme
  const list = terms(opts.keywords);
  let failed = 0;
  let asked = 0;
  for (const term of list) {
    if (Date.now() > stopAt) break;
    asked++;
    try {
      const first = await page(term, 1);
      let rows = first.rows;
      // další stránky; když některá selže nebo dojde čas, to už načtené nezahazujeme
      try {
        for (let n = 2; n <= Math.min(first.last, MAX_PAGES) && Date.now() < stopAt; n++) {
          const next = (await page(term, n)).rows;
          if (!next.length) break;
          rows = rows.concat(next);
        }
      } catch (e) {
        if (process.env.NEN_DEBUG) console.warn("NEN", term, "další stránka:", String(e));
      }
      // sloupce: Detail | Systémové číslo | Název | Stav | Zadavatel | Lhůta
      for (const [, code, title, state, buyer, lhuta] of rows) {
        const deadline = isoDate(lhuta);
        if (state !== "Neukončen" || (deadline ? deadline < today : !fresh(code, now))) continue;
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
    } catch (e) {
      failed++;
      if (process.env.NEN_DEBUG) console.warn("NEN", term, String(e));
    }
  }
  if (failed === asked) throw new Error("NEN neodpovídá");
  return [...seen.values()];
}
