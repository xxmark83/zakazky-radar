import { hlidacGet } from "./hlidac-api";
import { askJson, type ModelChoice } from "./ai";
import { isvzBuyerIco, isvzByBuyer } from "./sources/isvz";
import { smlouvyBuyerIco, smlouvyByBuyer } from "./sources/smlouvy";
import type { BuyerAi, BuyerHistory, Contract, Tender } from "./types";

// Historie zadavatele: co všechno za posledních 5 let podepsal (Hlídač státu = Registr smluv celý),
// doplněné o výsledky řízení z ISVZ. Nahoru jde IT a to, co souvisí s otevřenou zakázkou.
const UA = "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)";
const YEARS = 5;
const PAGES = 8; // Hlídač vrací po stránkách, víc nebereme, ať je to do půl minuty

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const LEGAL = /\b(spol s r o|s r o|a s|z s|s p|p o|o p s|z u|v v i|se)$/;
const bare = (s: string) => norm(s).replace(LEGAL, "").trim();

// stejná slova jako u Registru smluv (scripts/smlouvy.mjs), bez diakritiky
const IT = [
  "crm", "portal", "e learning", "elearning", "lms", "helpdesk", "service desk", "informacni system", "informacniho systemu",
  "software", "softwar", "aplikac", "webov", "saas", "cloud", "licenc", "ict", "it sluz", "it podpor", "spisov", "databaz",
  "digitaliz", "kybernet", "kyberbezpec", "nis2", "siem", "antivir", "firewall", "penetracni", "zranitelnost", "server",
  "pocitac", "sit lan", "hosting", "microsoft", "office 365", "erp", "ekonomicky system",
];
const isIt = (title: string) => {
  const f = ` ${norm(title)} `;
  return IT.some((w) => f.includes(w.length <= 4 ? ` ${w} ` : w));
};

// obecná slova, která najdeme skoro v každé smlouvě a o souvislosti nic neříkají
const STOP = new Set(
  ("dodavk dodani sluzb zajist zajisten system systemu provoz poskyt realiz zakazk smlouv obnov nakup ramcov verejn mesto mesta " +
    "krajsk nemocn projekt cast casti prace oprav servis pro pri jeho jejich ktere ktery ktera ramci roku letech novy nove nova " +
    "nasledn souvis vcetne zabezpec technick vybaven podle mestsk obec obce urad uradu").split(" "),
);
// krátké zkratky, které o oboru říkají hodně
const ACRONYMS = new Set(["crm", "lms", "erp", "gis", "ict", "soc", "edr", "xdr", "dms", "bi"]);
// slova ze zakázky zkrácená na kmen (6 znaků), aby „portálu“ našlo i „portál“
export function terms(...texts: string[]) {
  const words = texts
    .flatMap((t) => norm(t).split(" "))
    .filter((w) => (w.length >= 4 || ACRONYMS.has(w)) && !/^\d+$/.test(w));
  const stems = words.map((w) => w.slice(0, 6)).filter((w) => !STOP.has(w) && ![...STOP].some((s) => s.length >= 5 && w.startsWith(s)));
  return [...new Set(stems)];
}

// ---------- IČO zadavatele ----------
async function aresIco(name: string): Promise<{ ico: string; name: string } | null> {
  try {
    const res = await fetch("https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/vyhledat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ obchodniJmeno: name.slice(0, 200), pocet: 10 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const list: { ico: string; obchodniJmeno: string }[] = (await res.json()).ekonomickeSubjekty ?? [];
    const want = bare(name);
    // přesná shoda bez právní formy, pak název začínající hledaným, jinak nic (radši nic než cizí subjekt)
    const hit = list.find((x) => bare(x.obchodniJmeno) === want) ?? list.find((x) => bare(x.obchodniJmeno).startsWith(want));
    return hit ? { ico: hit.ico, name: hit.obchodniJmeno } : null;
  } catch {
    return null;
  }
}

export async function findBuyer(name: string): Promise<{ ico: string | null; name: string; via: string }> {
  const local = isvzBuyerIco(name) ?? smlouvyBuyerIco(name);
  if (local) return { ico: local, name, via: "ISVZ a Registr smluv" };
  const ares = await aresIco(name);
  if (ares) return { ico: ares.ico, name: ares.name, via: "ARES" };
  return { ico: null, name, via: "" };
}

// ---------- Hlídač státu ----------
const first = (...v: any[]) => v.find((x) => x !== undefined && x !== null && x !== "");

async function hlidacPages(dotaz: string, token: string): Promise<Contract[]> {
  const out: Contract[] = [];
  for (let strana = 1; strana <= PAGES; strana++) {
    // razeni=5: nově uzavřené první (dokumentace api.hlidacstatu.cz/swagger/v2/swagger.json)
    const url = `https://api.hlidacstatu.cz/api/v2/smlouvy/hledat?dotaz=${encodeURIComponent(dotaz)}&strana=${strana}&razeni=5`;
    const data = await hlidacGet(url, 12 * 3600); // historie se mění pomalu – 12 h z paměti
    const rows: any[] = data.results ?? data.Results ?? [];
    const total = Number(data.total ?? data.Total ?? 0);
    for (const r of rows) {
      const id = String(first(r.Id, r.id, r.identifikator?.idVerze) ?? "");
      if (!id) continue;
      const parties: any[] = first(r.Prijemce, r.prijemce) ?? [];
      const withVat = Number(first(r.hodnotaVcetneDph, r.HodnotaVcetneDph, r.CalculatedPriceWithVATinCZK));
      const value = Number(first(r.hodnotaBezDph, r.HodnotaBezDph)) || (withVat ? withVat / 1.21 : 0);
      out.push({
        id: `hs-${id}`,
        title: String(first(r.predmet, r.Predmet) ?? "(bez předmětu)").slice(0, 300),
        suppliers: parties.map((p) => first(p.nazev, p.Nazev)).filter(Boolean),
        value: value ? Math.round(value) : null,
        date: String(first(r.datumUzavreni, r.DatumUzavreni, r.casZverejneni, r.CasZverejneni) ?? "").slice(0, 10) || null,
        url: `https://www.hlidacstatu.cz/Detail/${id}`,
        source: "Hlídač státu",
        it: false,
        related: 0,
        matched: [],
      });
    }
    if (!rows.length || (total && out.length >= total)) break; // poslední stránka
  }
  return out;
}

async function hlidacContracts(ico: string, since: string, token: string) {
  // since jen na den, ať se dotaz během dne neměnil a šel brát z paměti
  const base = `icoPlatce:${ico} AND podepsano:[${since} TO *]`;
  // zvlášť dotaz na IT, aby se u velkých úřadů neztratily mezi stovkami jiných smluv
  const it = `${base} AND (software OR aplikace OR "informační systém" OR licence OR portál OR CRM OR cloud OR helpdesk OR kybernetická OR e-learning OR webové)`;
  const a = await hlidacPages(it, token);
  const b = await hlidacPages(base, token);
  return [...a, ...b];
}

// ---------- celá historie ----------
export async function buyerHistory(tender: Tender, keywords: string): Promise<BuyerHistory> {
  const buyer = await findBuyer(tender.buyer);
  const since = new Date(Date.now() - YEARS * 365 * 86400_000).toISOString().slice(0, 10);
  const token = process.env.HLIDAC_TOKEN;
  const warnings: string[] = [];

  let contracts: Contract[] = [];
  if (token && buyer.ico) {
    try {
      contracts = await hlidacContracts(buyer.ico, since, token);
    } catch (e: any) {
      warnings.push(`${e.message}. Zatím ukazuji jen IT smlouvy z našich dat.`);
    }
  }
  // bez tokenu (nebo při chybě) aspoň IT smlouvy z Registru smluv, které sbíráme sami
  const days = YEARS * 365;
  if (!contracts.length) {
    contracts = smlouvyByBuyer(buyer.ico, tender.buyer, days).map((a) => ({
      id: a.id,
      title: a.title,
      suppliers: a.winners,
      value: a.value,
      date: a.published,
      url: a.url,
      source: "Registr smluv",
      it: false,
      related: 0,
      matched: [],
    }));
  }
  const tenders: Contract[] = isvzByBuyer(buyer.ico, tender.buyer, days).map((a) => ({
    id: a.id,
    title: a.title,
    suppliers: a.winners,
    value: a.value,
    date: a.published,
    url: a.url,
    source: "ISVZ",
    it: false,
    related: 0,
    matched: [],
    offers: a.offers ?? null,
  }));

  // bez duplicit (stejná smlouva z obou dotazů na Hlídač)
  const seen = new Set<string>();
  const all = [...contracts, ...tenders].filter((c) => {
    const k = c.source === "ISVZ" ? c.id : `${norm(c.title)}|${c.date}|${c.value}`;
    if (seen.has(k) || seen.has(c.id)) return false;
    seen.add(k);
    seen.add(c.id);
    return true;
  });

  const want = terms(tender.title, tender.description.slice(0, 400));
  const extra = terms(keywords);
  for (const c of all) {
    const f = norm(c.title);
    c.it = isIt(c.title);
    c.matched = [...new Set([...want, ...extra].filter((w) => (w.length <= 3 ? ` ${f} `.includes(` ${w} `) : f.includes(w))))];
    // slova přímo z názvu zakázky váží dvojnásob proti obecným slovům z nabídky
    c.related = c.matched.reduce((s, w) => s + (want.includes(w) ? 2 : 1), 0);
  }
  const top = (c: Contract) => c.it || c.related > 0;
  all.sort(
    (a, b) =>
      Number(top(b)) - Number(top(a)) || b.related - a.related || Number(b.it) - Number(a.it) || (b.date ?? "").localeCompare(a.date ?? ""),
  );

  return {
    buyer: { ...buyer, query: tender.buyer },
    full: Boolean(token && buyer.ico && !warnings.length),
    years: YEARS,
    warnings,
    items: all,
  };
}

// ---------- AI zhodnocení ----------
const AI_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    incumbent: { type: "string" },
    prices: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, relevance: { type: "integer" }, note: { type: "string" } },
        required: ["id", "relevance", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "incumbent", "prices", "items"],
  additionalProperties: false,
} as const;

const AI_SYSTEM = `Jsi analytik veřejných zakázek. Dostaneš novou zakázku, nabídku malé firmy a seznam smluv a zakázek, které tentýž zadavatel uzavřel v posledních letech.
Odpovídej česky, stručně, nic si nevymýšlej – vycházej jen ze seznamu.
- summary: 2–3 věty, co zadavatel v IT dosud kupoval a co z toho plyne pro novou zakázku.
- incumbent: kdo je nejspíš současný dodavatel toho, co nová zakázka poptává, a kdy to podepsali (nebo „nelze určit“).
- prices: za kolik zadavatel podobné věci kupoval (rozpětí v Kč bez DPH), nebo „bez podkladů“.
- items: jen smlouvy, které s novou zakázkou opravdu souvisejí (max 15), id přesně ze seznamu, relevance 0–100, note jedna věta proč.`;

export async function buyerAi(profile: string, tender: Tender, items: Contract[], model: ModelChoice) {
  const list = items.slice(0, 80).map((c) => ({
    id: c.id,
    predmet: c.title,
    dodavatel: c.suppliers.join(", "),
    hodnota: c.value,
    datum: c.date,
    zdroj: c.source,
  }));
  return askJson<BuyerAi>({
    model,
    system: AI_SYSTEM,
    schema: AI_SCHEMA,
    effort: "low",
    content: `MOJE NABÍDKA:\n${profile}\n\nNOVÁ ZAKÁZKA:\n${JSON.stringify({
      nazev: tender.title,
      zadavatel: tender.buyer,
      popis: tender.description.slice(0, 1500),
    })}\n\nSMLOUVY A ZAKÁZKY ZADAVATELE:\n${JSON.stringify(list)}`,
  });
}
