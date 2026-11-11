import { unzipSync } from "fflate";
import { profilyRow } from "./sources/profily";
import type { Tender } from "./types";

// Zadávací dokumentace pro AI rozbor. Každý profil zadavatele musí podle vyhlášky 345/2023 Sb. uvádět
// v XML (XMLdataVZ) u zakázky odkazy na dokumenty i jejich typ, takže je najdeme spolehlivě bez ohledu
// na portál. Když zakázka z profilu není, zkusíme odkazy na stránce zakázky (E-ZAK, PDF).
const UA = "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)";
const MAX_DOCS = 4;
const MAX_BYTES = 15_000_000; // na jeden soubor
const MAX_PDF_TOTAL = 20_000_000; // Claude bere nejvýš 32 MB na dotaz (base64 je o třetinu větší)
const MAX_TEXT = 60_000; // znaků z Wordu a textu

export type DocRef = { url: string; type: string };
export type Doc = { name: string; type: string } & ({ pdf: string } | { text: string });

const ddmmyyyy = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;
const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

// pořadí: co nejvíc řekne o tom, co zadavatel chce a jaké má podmínky
const RANK: [RegExp, number][] = [
  [/zadávací dokumentace|výzva|zadávací podmínky|kvalifika/i, 0],
  [/technick|specifikac|smlouv[ay]? \(návrh|návrh smlouvy|příloh/i, 1],
  [/vysvětlení|změna|doplnění/i, 2],
  [/jiný dokument|^$/i, 3],
  [/písemná zpráva|oznámení o výběru|rozhodnutí|uzavřená smlouva|výsledek/i, 9], // po zadání, k rozboru nepomůže
];
const rank = (type: string) => RANK.find(([re]) => re.test(type))?.[1] ?? 3;

async function fromProfile(profileUrl: string, id: string, published: string | null): Promise<DocRef[]> {
  const from = published ? new Date(new Date(published).getTime() - 3 * 86400_000) : new Date(Date.now() - 120 * 86400_000);
  const url = `${profileUrl.replace(/\/+$/, "")}/XMLdataVZ?od=${ddmmyyyy(from)}&do=${ddmmyyyy(new Date())}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return [];
  const xml = await res.text();
  // id v datech je „pz-<id_nipez>“ nebo „pz-<profil>#<id_objektu>“
  const key = id.replace(/^pz-/, "").split("#").pop()!;
  for (const z of xml.match(/<zakazka>[\s\S]*?<\/zakazka>/g) ?? []) {
    const ids = [...z.matchAll(/<(?:id_nipez|id_objektu)>([\s\S]*?)<\/(?:id_nipez|id_objektu)>/g)].map((m) => decode(m[1]));
    if (!ids.includes(key)) continue;
    return [...z.matchAll(/<dokument>([\s\S]*?)<\/dokument>/g)].map(([, d]) => ({
      url: decode(d.match(/<url>([\s\S]*?)<\/url>/)?.[1] ?? ""),
      type: decode(d.match(/<typ_dokumentu>([\s\S]*?)<\/typ_dokumentu>/)?.[1] ?? ""),
    }));
  }
  return [];
}

async function fromPage(pageUrl: string): Promise<DocRef[]> {
  if (!/^https:\/\//.test(pageUrl)) return [];
  const res = await fetch(pageUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return [];
  const html = await res.text();
  const links = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map(([, href, label]) => ({ href: decode(href), label: label.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }))
    .filter(({ href, label }) => /document_download|\.pdf($|\?)|\.docx?($|\?)|stahovani-dokumentu|\/file\?/i.test(href) || /\.(pdf|docx?)$/i.test(label));
  return links.map(({ href, label }) => ({ url: new URL(href, pageUrl).href, type: label }));
}

/** Odkazy na dokumenty zakázky, nejdůležitější první. */
export async function findDocs(t: Tender): Promise<DocRef[]> {
  const row = profilyRow(t);
  let refs: DocRef[] = [];
  try {
    if (row) refs = await fromProfile(row.url, row.id, row.published);
    if (!refs.length) refs = await fromPage(t.url);
  } catch {
    // dokumentace je bonus – rozbor proběhne i bez ní
  }
  const seen = new Set<string>();
  return refs
    .filter((r) => r.url && !seen.has(r.url) && seen.add(r.url) && rank(r.type) < 9)
    .sort((a, b) => rank(a.type) - rank(b.type));
}

function nameOf(res: Response, ref: DocRef) {
  const cd = res.headers.get("content-disposition") ?? "";
  const m = cd.match(/filename\*=UTF-8''([^;]+)/i) ?? cd.match(/filename="?([^";]+)"?/i);
  try {
    return m ? decodeURIComponent(m[1]) : ref.type || ref.url.split("/").pop() || "dokument";
  } catch {
    return m?.[1] ?? "dokument";
  }
}

// text z Wordu (DOCX je ZIP s word/document.xml)
function docxText(bytes: Uint8Array) {
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = new TextDecoder().decode(files["word/document.xml"] ?? new Uint8Array());
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// Názvy souborů v ZIPu z Windows bývají v kódování CP852 (DOS, čeština) a knihovna je čte jako Latin-1:
// z „Příloha č. 7“ je „Pý¡loha Ÿ. 7“. Zkusíme UTF-8, jinak CP852.
const CP852 = "ÇüéâäůćçłëŐőîŹÄĆÉĹĺôöĽľŚśÖÜŤťŁ×čáíóúĄąŽžĘę¬źČş«»░▒▓│┤ÁÂĚŞ╣║╗╝Żż┐└┴┬├─┼Ăă╚╔╩╦╠═╬¤đĐĎËďŇÍÎě┘┌█▄ŢŮ▀ÓßÔŃńňŠšŔÚŕŰýÝţ´­˝˛ˇ˘§÷¸°¨˙űŘř■ ";
function zipName(n: string) {
  if (!/[\u0080-\u00ff]/.test(n) || /[\u0100-\uffff]/.test(n)) return n;
  const bytes = Uint8Array.from(n, (ch) => ch.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return Array.from(bytes, (b) => (b < 128 ? String.fromCharCode(b) : CP852[b - 128])).join("");
  }
}

// vzory formulářů (čestná prohlášení, krycí list) o zakázce nic neřeknou – nesmí zabrat místo výzvě nebo smlouvě
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const isTemplate = (name: string) => {
  const n = plain(name);
  return /cestne? prohlaseni|kryci list|formular|sankc|stret zajm|seznam poddodavatel|vzor/.test(n) && !/smlouv|zadavaci dokumentac|vyzv|kvalifika|technick|specifika/.test(n);
};
const nameRank = (name: string) => {
  const n = plain(name);
  return /zadavaci dokumentac|vyzv|zadavaci podmink|kvalifika/.test(n) ? 0 : /smlouv|technick|specifika/.test(n) ? 1 : 2;
};

/** Soubor → dokument pro AI. PDF jde celé (Claude ho čte i s tabulkami), z Wordu text, ZIP rozbalí. */
export function toDocs(name: string, type: string, bytes: Uint8Array): Doc[] {
  const head = new TextDecoder().decode(bytes.slice(0, 5));
  if (head.startsWith("%PDF")) return [{ name, type, pdf: Buffer.from(bytes).toString("base64") }];
  if (head.startsWith("PK")) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch {
      return [];
    }
    if (files["word/document.xml"]) return [{ name, type, text: docxText(bytes).slice(0, MAX_TEXT) }];
    // ZIP s více dokumenty: vzít PDF a Wordy uvnitř
    return Object.entries(files)
      .filter(([n]) => /\.(pdf|docx)$/i.test(n) && !n.startsWith("__MACOSX"))
      .flatMap(([n, b]) => toDocs(zipName(n).split("/").pop()!, type, b))
      .sort((a, b) => nameRank(a.name) - nameRank(b.name));
  }
  return [];
}

// začátek PDF („%PDF“) nebo ZIP/Wordu („PK\x03\x04“) v prvních 2 kB, jinak -1
function docStart(b: Uint8Array) {
  const end = Math.min(b.length - 4, 2048);
  for (let i = 0; i < end; i++) {
    if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46) return i;
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x03 && b[i + 3] === 0x04) return i;
  }
  return -1;
}

const isDoc = (b: Uint8Array) => /^(%PDF|PK)/.test(new TextDecoder().decode(b.slice(0, 4)));

// Stažení souboru přes zvláštnosti portálů:
// - Tender arena pošle soubor rovnou v odpovědi s přesměrováním (přesměrování vede na webovou stránku)
// - E-ZAK nejdřív vrátí stránku „stažení souboru“ s odkazem document_N/… na skutečný soubor
async function download(url: string, depth = 0, waited = false): Promise<{ res: Response; bytes: Uint8Array } | "big" | "busy" | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  // Tender arena pustí asi 5 stažení za minutu, pak vrací 429: jednou počkat a zkusit znovu
  if (res.status === 429) {
    if (waited) return "busy";
    await new Promise((r) => setTimeout(r, 13_000));
    return download(url, depth, true);
  }
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return "big";
  let bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) return "big";
  // Tender arena posílá soubor v těle přesměrování, ale před něj server vloží krátké HTML
  // („<a href=…>Found</a>.“) – soubor proto začíná až o pár desítek bajtů dál
  if (!isDoc(bytes) && res.status >= 300 && res.status < 400) {
    const at = docStart(bytes);
    if (at > 0) bytes = bytes.slice(at);
  }
  if (isDoc(bytes)) return { res, bytes };
  if (depth >= 3) return null;
  const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
  if (loc) return download(new URL(loc, url).href, depth + 1);
  const link = res.ok ? new TextDecoder().decode(bytes).match(/href="(document_\d+\/[^"]+)"/)?.[1] : null;
  return link ? download(new URL(link, url).href, depth + 1) : null;
}

/** Co se z dokumentace přečetlo a co ne (a proč) – aby bylo vidět, na čem posouzení stojí. */
export type DocReport = { docs: Doc[]; skipped: { name: string; why: string }[] };

// stažená dokumentace na 30 minut v paměti serveru: rozbor, Zvládneme to? a dotazy ke stejné zakázce
// ji pak ze stránek zadavatele nestahují pokaždé znovu
const docCache = new Map<string, { at: number; report: DocReport }>();
export async function fetchDocsReport(t: Tender): Promise<DocReport> {
  const key = t.url || t.id;
  const hit = docCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.report;
  const report = await fetchDocsFresh(t);
  if (report.docs.length) {
    docCache.set(key, { at: Date.now(), report });
    while (docCache.size > 8) docCache.delete(docCache.keys().next().value!);
  }
  return report;
}

/** Stáhne nejdůležitější dokumenty zakázky (nejvýš 4, PDF dohromady do 20 MB). */
export const fetchDocs = async (t: Tender): Promise<Doc[]> => (await fetchDocsReport(t)).docs;

const refName = (ref: DocRef) => {
  const last = decodeURIComponent(ref.url.split(/[?#]/)[0].split("/").pop() ?? "").slice(0, 80);
  return ref.type && last && /\.\w{2,5}$/.test(last) ? `${ref.type} – ${last}` : ref.type || last || "dokument";
};

async function fetchDocsFresh(t: Tender): Promise<DocReport> {
  const docs: Doc[] = [];
  const skipped: DocReport["skipped"] = [];
  const templates: Doc[] = [];
  let pdfBytes = 0;
  const refs = await findDocs(t);
  for (const [i, ref] of refs.entries()) {
    if (docs.length >= MAX_DOCS || i >= 8) {
      skipped.push({ name: refName(ref), why: `nad limit ${MAX_DOCS} dokumentů na jedno posouzení` });
      continue;
    }
    try {
      const got = await download(ref.url);
      if (got === "big") skipped.push({ name: refName(ref), why: "větší než 15 MB" });
      if (got === "busy") skipped.push({ name: refName(ref), why: "server zadavatele omezuje počet stažení – zkus posouzení za minutu znovu" });
      if (!got) skipped.push({ name: refName(ref), why: "nepodařilo se stáhnout, nebo to není PDF ani Word" });
      if (!got || got === "big" || got === "busy") continue;
      const name = nameOf(got.res, ref);
      const inside = toDocs(name, ref.type, got.bytes);
      if (!inside.length) skipped.push({ name, why: "soubor se nepodařilo přečíst (jiný formát než PDF, Word nebo ZIP)" });
      for (const d of inside) {
        if (isTemplate(d.name)) {
          templates.push(d);
          continue;
        }
        if (docs.length >= MAX_DOCS) {
          skipped.push({ name: d.name, why: `nad limit ${MAX_DOCS} dokumentů na jedno posouzení` });
          continue;
        }
        if ("pdf" in d) {
          const size = (d.pdf.length * 3) / 4;
          if (pdfBytes + size > MAX_PDF_TOTAL) {
            skipped.push({ name: d.name, why: "nevešel se do limitu 20 MB pro PDF" });
            continue;
          }
          pdfBytes += size;
        } else if (d.text.length >= MAX_TEXT) skipped.push({ name: d.name, why: `přečten jen začátek (prvních ${MAX_TEXT.toLocaleString("cs-CZ")} znaků)` });
        docs.push(d);
      }
    } catch {
      skipped.push({ name: refName(ref), why: "nepodařilo se stáhnout" });
    }
  }
  // když se nenašlo nic jiného, lepší vzory než nic
  if (!docs.length) docs.push(...templates.splice(0, MAX_DOCS).filter((d) => !("pdf" in d) || d.pdf.length * 0.75 <= MAX_PDF_TOTAL / MAX_DOCS));
  for (const d of templates) skipped.push({ name: d.name, why: "vzor formuláře (čestné prohlášení, krycí list) – k posouzení není potřeba" });
  return { docs, skipped };
}
