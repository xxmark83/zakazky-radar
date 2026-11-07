// Zakázky z Portálu pro vhodné uveřejnění (vhodne-uverejneni.cz, ~1 600 zadavatelů, hlavně obce).
// Jejich robots.txt chce 30 s mezi dotazy, takže stahovat každý profil zvlášť by trvalo 13 hodin.
// Místo toho čteme jejich veřejný RSS kanál všech nových zakázek (stránkovaný ?page=N) a u každé
// zakázky jednou otevřeme detail kvůli zadavateli a lhůtě. Výsledek: data/vhodne.json.
//
// node scripts/vhodne.mjs   – nové zakázky z RSS + doplnění detailů, dokud nevyprší BUDGET_MIN (výchozí 50)
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "data/vhodne.json";
const BASE = "https://www.vhodne-uverejneni.cz";
const UA = "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)";
const GAP = 30_000; // Crawl-Delay z robots.txt
const BACK_DAYS = 35; // starší zakázky už většinou nejdou podat
const MAX_PAGES = 40;
const BUDGET = Number(process.env.BUDGET_MIN || 50) * 60_000;
const started = Date.now();
const today = new Date().toISOString().slice(0, 10);

class Blocked extends Error {}
let last = 0;
async function get(url) {
  const wait = last + GAP - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if ([403, 429, 503].includes(res.status)) throw new Blocked(String(res.status));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (_, e) =>
      e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e] ?? " "),
    )
    .replace(/\s+/g, " ")
    .trim();
const text = (html) => decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " | "));

// hodnota za popiskem v textu stránky („Popisek | | hodnota | |“)
const after = (t, label) => t.split(label)[1]?.split("|").map((s) => s.trim()).find(Boolean) ?? "";
const isoDate = (s) => {
  const m = s.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};

function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    const tag = (n) => decode(it.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))?.[1] ?? "");
    const url = tag("link");
    return {
      id: `vu-${url.split("/zakazka/")[1] ?? url}`,
      title: tag("title"),
      buyer: "",
      published: new Date(tag("pubDate")).toISOString().slice(0, 10),
      deadline: null,
      regime: "",
      cpv: "",
      description: tag("description").slice(0, 600),
      url,
      detail: false, // ještě nemáme zadavatele a lhůtu z detailu
    };
  });
}

function parseDetail(html, t) {
  const s = text(html);
  const info = s.split("Informace o zadavateli")[1] ?? "";
  return {
    ...t,
    buyer: after(info, "Název") || t.buyer,
    deadline: isoDate(after(s, "Datum ukončení příjmu nabídek")) ?? isoDate(after(s, "Lhůta pro podání nabídek")),
    regime: after(s, "Režim"),
    closed: !/neukončen/i.test(after(s, "Stav")),
    detail: true,
  };
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { tenders: [] };
const byId = new Map(prev.tenders.map((t) => [t.id, t]));
// ukončené a prošlé si pamatujeme (id, zveřejněno), ať je RSS při dalším běhu nevrací jako nové
const done = new Map(prev.done ?? []);
const cutoff = new Date(Date.now() - BACK_DAYS * 86400_000).toISOString().slice(0, 10);
// poprvé projdeme 35 dní zpět, potom jen do posledního běhu (s dnem rezervy)
const until = prev.updated ? new Date(new Date(prev.updated).getTime() - 86400_000).toISOString().slice(0, 10) : cutoff;
let blocked = "";
let added = 0;
let details = 0;

try {
  for (let page = 1; page <= MAX_PAGES && Date.now() - started < BUDGET; page++) {
    const items = parseRss(await get(`${BASE}/rss/zakazky${page > 1 ? `?page=${page}` : ""}`));
    if (!items.length) break;
    for (const t of items) {
      if (t.published < cutoff || byId.has(t.id) || done.has(t.id)) continue;
      byId.set(t.id, t);
      added++;
    }
    if (items.at(-1).published < until) break;
  }
  // detaily: napřed nejnovější, ty mají nejspíš ještě otevřenou lhůtu
  const todo = [...byId.values()].filter((t) => !t.detail).sort((a, b) => b.published.localeCompare(a.published));
  for (const t of todo) {
    if (Date.now() - started > BUDGET) break;
    try {
      byId.set(t.id, parseDetail(await get(t.url), t));
      details++;
    } catch (e) {
      if (e instanceof Blocked) throw e;
      // „externí zakázky“ (z jiných portálů) mají detail jen po přihlášení – necháme údaje z RSS a dál to nezkoušíme
      if (/HTTP (401|404|410)/.test(e.message)) byId.set(t.id, { ...t, detail: true });
      else console.log(`${t.url}: ${e.message}`);
    }
  }
} catch (e) {
  blocked = e instanceof Blocked ? `zablokováno (${e.message})` : e.message;
}

// ukončené, prošlé a staré bez detailu vypadnou
const tenders = [...byId.values()].filter(
  (t) => !t.closed && (!t.deadline || t.deadline >= today) && (t.detail || t.published >= cutoff),
);
const waiting = tenders.filter((t) => !t.detail).length;
const open = new Set(tenders.map((t) => t.id));
for (const t of byId.values()) if (!open.has(t.id)) done.set(t.id, t.published);
const doneList = [...done].filter(([, published]) => published >= cutoff);
writeFileSync(
  OUT,
  JSON.stringify({ updated: blocked && prev.updated ? prev.updated : new Date().toISOString(), tenders, done: doneList }),
);
console.log(
  `Hotovo za ${Math.round((Date.now() - started) / 60_000)} min: ${added} nových z RSS, ${details} detailů, ` +
    `${tenders.length} otevřených (${waiting} čeká na detail)${blocked ? `, přerušeno: ${blocked}` : ""}`,
);
if (blocked && !added && !details) process.exitCode = 1;
