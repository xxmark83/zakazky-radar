// Registr smluv (smlouvy.gov.cz): smlouvy veřejných institucí nad 50 tis. Kč – i ty uzavřené bez soutěže.
// Pro průzkum trhu a profil konkurenta: kdo komu prodal CRM, portál, e-learning nebo jiný software a za kolik.
// Otevřená data jsou denní a měsíční XML. Ukládáme jen smlouvy z IT podle slov v předmětu
// a jen smluvní strany s IČO (bez fyzických osob a jmen schvalujících).
//
// node scripts/smlouvy.mjs                  – posledních 7 dní (denní výpisy), každé ráno
// node scripts/smlouvy.mjs 2025-01 2026-10  – rozsah měsíců (první naplnění)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";

const OUT = "data/smlouvy-it.json";
const UA = "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)";
const KEEP_MONTHS = 24;
// slova v předmětu smlouvy, podle kterých poznáme IT (malými písmeny, bez diakritiky)
const IT = [
  "crm",
  "portal",
  "e-learning",
  "elearning",
  "lms",
  "helpdesk",
  "service desk",
  "servicedesk",
  "informacni system",
  "informacniho systemu",
  "software",
  "softwar",
  "aplikac",
  "webov",
  "web ",
  "saas",
  "cloud",
  "licenc",
  "ict",
  "it sluz",
  "it podpor",
  "spisov", // spisová služba
  "databaz",
  "digitaliz",
  "kybernet", // kybernetická bezpečnost
  "kyberbezpec",
  "nis2",
  "siem",
  "antivir",
  "firewall",
  "penetracni",
  "zranitelnost",
];

const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (_, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e] ?? `&${e};`),
);
const tag = (x, name) => {
  const m = x.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]).trim() : "";
};

function contract(z) {
  if (tag(z, "platnyZaznam") === "0") return null;
  const subject = tag(z, "predmet");
  const f = ` ${fold(subject)} `;
  if (!IT.some((w) => f.includes(w))) return null;
  const buyer = z.match(/<subjekt>([\s\S]*?)<\/subjekt>/)?.[1] ?? "";
  const parties = [...z.matchAll(/<smluvniStrana>([\s\S]*?)<\/smluvniStrana>/g)]
    .map((m) => ({ name: tag(m[1], "nazev"), ico: tag(m[1], "ico") }))
    .filter((p) => p.ico && p.name); // bez IČO = fyzická osoba, neukládáme
  if (!parties.length) return null;
  const value = Number(tag(z, "hodnotaBezDph")) || (Number(tag(z, "hodnotaVcetneDph")) || 0) / 1.21 || null;
  return {
    id: `rs-${tag(z, "idSmlouvy")}`,
    version: Number(tag(z, "idVerze")) || 0,
    title: subject.slice(0, 300),
    buyer: tag(buyer, "nazev"),
    buyerIco: tag(buyer, "ico") || null,
    published: tag(z, "datumUzavreni") || tag(z, "casZverejneni").slice(0, 10) || null,
    winners: parties.map((p) => p.name),
    winnerIco: parties.map((p) => p.ico),
    value: value ? Math.round(value) : null,
    currency: tag(z, "mena") || "CZK",
    url: tag(z, "odkaz"),
  };
}

// výpis čteme proudem po záznamech <zaznam>…</zaznam>
async function dump(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(600_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = [];
  let buf = "";
  let n = 0;
  for await (const chunk of Readable.fromWeb(res.body).setEncoding("utf8")) {
    buf += chunk;
    let end;
    while ((end = buf.indexOf("</zaznam>")) >= 0) {
      const start = buf.lastIndexOf("<zaznam>", end);
      const z = buf.slice(start, end + 9);
      buf = buf.slice(end + 9);
      n++;
      const c = contract(z);
      if (c) rows.push(c);
    }
  }
  console.log(`${url}: ${n} smluv, ${rows.length} z IT`);
  return rows;
}

const pad = (n) => String(n).padStart(2, "0");
const args = process.argv.slice(2);
const urls = [];
if (args.length) {
  let [y, m] = args[0].split("-").map(Number);
  const [ty, tm] = (args[1] ?? args[0]).split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    urls.push(`https://data.smlouvy.gov.cz/dump_${y}_${pad(m)}.xml`);
    if (++m > 12) (m = 1), y++;
  }
} else {
  // denní výpisy se ještě několik dní doplňují, proto bereme celý poslední týden
  for (let i = 7; i >= 1; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    urls.push(`https://data.smlouvy.gov.cz/dump_${d.getUTCFullYear()}_${pad(d.getUTCMonth() + 1)}_${pad(d.getUTCDate())}.xml`);
  }
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")).contracts : [];
const merged = new Map(prev.map((c) => [c.id, c]));
for (const url of urls) {
  try {
    for (const c of (await dump(url)) ?? []) if ((merged.get(c.id)?.version ?? -1) <= c.version) merged.set(c.id, c);
  } catch (e) {
    console.log(`${url}: chyba ${e.message}`);
  }
}
const cutoff = new Date();
cutoff.setUTCMonth(cutoff.getUTCMonth() - KEEP_MONTHS);
const contracts = [...merged.values()]
  .filter((c) => !c.published || c.published >= cutoff.toISOString().slice(0, 10))
  .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), contracts }));
console.log(`Hotovo: ${contracts.length} smluv z IT za posledních ${KEEP_MONTHS} měsíců`);
