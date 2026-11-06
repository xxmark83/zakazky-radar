// Výsledky zadávacích řízení z otevřených dat ISVZ (Registr veřejných zakázek: Věstník, NEN, Tender arena,
// TENDERMARKET). Na rozdíl od TED obsahují i podlimitní zakázky, cenu smlouvy a počet nabídek.
// Data vycházejí jednou měsíčně (5. den) jako ZIP s JSON kolem 1 GB, proto se čtou proudem a ukládají
// se jen smlouvy z oborů, které nás zajímají (CPV níže), bez osobních údajů kontaktních osob.
//
// node scripts/isvz.mjs                 – stáhne minulý měsíc a přidá ho do data/isvz-vysledky.json
// node scripts/isvz.mjs 2025-01 2026-09 – stáhne rozsah měsíců (první naplnění)
// ISVZ_FILE=VZ-09-2026.json node scripts/isvz.mjs – zpracuje už stažený soubor (pro ladění)
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const OUT = "data/isvz-vysledky.json";
const UA = "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)";
const KEEP_MONTHS = 36;
// software (48), IT služby (72), výzkum a poradenství (73), obchodní služby (79), vzdělávání (80)
const CPV = ["48", "72", "73", "79", "80"];

function months(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) (m = 1), y++;
  }
  return out;
}

// záznamy pole "data" po jednom, bez načtení celého souboru do paměti
async function* records(stream) {
  let depth = 0, inStr = false, esc = false, pending = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    let start = depth >= 2 ? 0 : -1;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (c === 92) esc = true; // \
        else if (c === 34) inStr = false; // "
        continue;
      }
      if (c === 34) inStr = true;
      else if (c === 123) { // {
        if (++depth === 2) start = i;
      } else if (c === 125) { // }
        if (depth-- === 2) {
          yield pending + chunk.slice(start, i + 1);
          pending = "";
          start = -1;
        }
      }
    }
    if (start >= 0) pending += chunk.slice(start);
  }
}

const day = (s) => (s ? String(s).slice(0, 10) : null);

// jedna smlouva = jeden řádek; zakázka může mít víc částí a každá víc smluv
function awards(rec) {
  const vz = rec.verejna_zakazka;
  if (!vz) return [];
  const buyer = vz.zadavaci_postupy?.[0]?.zadavatel_zadavaciho_postupu?.zadavatele?.[0]?.subjekt ?? {};
  const out = [];
  for (const part of vz.casti_verejne_zakazky ?? []) {
    const cpv = part.predmet?.hlavni_kod_CPV ?? vz.predmet?.hlavni_kod_CPV ?? "";
    if (!CPV.some((p) => cpv.startsWith(p))) continue;
    const zp = part.zadavaci_postup_pro_cast ?? {};
    const offers = (zp.podane_nabidky_nebo_zadosti_o_ucast ?? []).find((x) => x.druh_podanych_nabidek_nebo_zadosti_o_ucast === "Celkový počet nabídek")
      ?.pocet_podanych_nabidek_nebo_zadosti_o_ucast;
    for (const s of zp.vysledek?.smlouva ?? []) {
      const winners = (s.dodavatele_se_kterymi_byla_uzavrena_smlouva ?? []).map((d) => d.subjekt).filter(Boolean);
      if (!winners.length) continue;
      out.push({
        id: `isvz-${s.identifikator_NIPEZ ?? `${part.identifikator_NIPEZ}-${out.length}`}`,
        title: part.nazev_casti_verejne_zakazky || vz.nazev_verejne_zakazky,
        buyer: buyer.nazev_subjektu ?? "",
        buyerIco: buyer.ico ?? null,
        published: day(s.datum_uzavreni_smlouvy),
        winners: winners.map((w) => w.nazev_subjektu).filter(Boolean),
        winnerIco: winners.map((w) => w.ico ?? null),
        value: Number(s.hodnota_smluvni_ceny_bez_DPH) || null,
        currency: s.hodnota_smluvni_ceny_mena ?? "CZK",
        cpv: [cpv],
        nuts: part.predmet?.mista_plneni?.[0]?.nuts ?? null,
        offers: typeof offers === "number" ? offers : null,
        url: zp.odkaz_na_profil ?? "",
      });
    }
  }
  return out;
}

async function processFile(stream) {
  const rows = [];
  let n = 0;
  for await (const raw of records(stream)) {
    n++;
    if (!raw.includes("dodavatele_se_kterymi_byla_uzavrena_smlouva")) continue;
    try {
      rows.push(...awards(JSON.parse(raw)));
    } catch {}
  }
  console.log(`  ${n} zakázek, ${rows.length} smluv z vybraných oborů`);
  return rows;
}

async function month(ym) {
  const [y, m] = ym.split("-");
  const url = `https://isvz.nipez.cz/sites/default/files/content/opendata-rvz/VZ-${m}-${y}.zip`;
  const dir = mkdtempSync(path.join(tmpdir(), "isvz-"));
  try {
    console.log(`${ym}: stahuji ${url}`);
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const zip = path.join(dir, "vz.zip");
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
    const unzip = spawn("unzip", ["-p", zip]);
    return await processFile(unzip.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { months: [], awards: [] };
let list;
if (process.env.ISVZ_FILE) {
  const { createReadStream } = await import("node:fs");
  const rows = await processFile(createReadStream(process.env.ISVZ_FILE));
  list = [["soubor", rows]];
} else {
  const args = process.argv.slice(2);
  const last = new Date();
  last.setUTCDate(1);
  last.setUTCMonth(last.getUTCMonth() - 1);
  const lastYm = last.toISOString().slice(0, 7);
  const wanted = args.length ? months(args[0], args[1] ?? args[0]) : [lastYm];
  list = [];
  for (const ym of wanted) {
    try {
      list.push([ym, await month(ym)]);
    } catch (e) {
      console.log(`${ym}: chyba ${e.message}`);
    }
  }
}

const merged = new Map(prev.awards.map((a) => [a.id, a]));
for (const [, rows] of list) for (const r of rows) merged.set(r.id, r);
const cutoff = new Date();
cutoff.setUTCMonth(cutoff.getUTCMonth() - KEEP_MONTHS);
const awardsOut = [...merged.values()]
  .filter((a) => !a.published || a.published >= cutoff.toISOString().slice(0, 10))
  .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
const monthsOut = [...new Set([...prev.months, ...list.map(([ym]) => ym).filter((x) => x !== "soubor")])].sort();

writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), cpv: CPV, months: monthsOut, awards: awardsOut }));
console.log(`Hotovo: ${awardsOut.length} smluv, měsíce ${monthsOut[0] ?? "–"} až ${monthsOut.at(-1) ?? "–"}`);
