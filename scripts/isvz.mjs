// Výsledky zadávacích řízení z otevřených dat ISVZ (Registr veřejných zakázek: Věstník, NEN, Tender arena,
// TENDERMARKET). Na rozdíl od TED obsahují i podlimitní zakázky, cenu smlouvy a počet nabídek.
// Data vycházejí jednou měsíčně (5. den) jako ZIP s JSON kolem 1 GB, proto se čtou proudem a ukládají
// se jen smlouvy z oborů, které nás zajímají (CPV níže), bez osobních údajů kontaktních osob.
//
// Ze stejného zdroje bere i dynamické nákupní systémy (DNS) – do těch se dá přidat kdykoli → data/isvz-dns.json.
//
// node scripts/isvz.mjs                 – stáhne minulý měsíc a přidá ho do data/isvz-vysledky.json
// node scripts/isvz.mjs 2025-01 2026-09 – stáhne rozsah měsíců (první naplnění)
// ISVZ_FILE=VZ-09-2026.json ISVZ_DNS_FILE=DNS-09-2026.json node scripts/isvz.mjs – už stažené soubory (ladění)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const OUT = "data/isvz-vysledky.json";
const DNS_OUT = "data/isvz-dns.json";
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

// dynamický nákupní systém: dodavatel se může zapojit kdykoli po celou dobu trvání
function dns(rec) {
  const d = rec.dynamicky_nakupni_system;
  if (!d) return null;
  const zp = d.zadavaci_postup_pro_zavedeni_dynamickeho_nakupniho_systemu ?? {};
  const subj = d.predmet_verejne_zakazky_zadavany_v_dynamickem_nakupnim_systemu ?? {};
  const cats = d.kategorie_dynamickeho_nakupniho_systemu ?? [];
  const cpv = [
    subj.hlavni_kod_CPV,
    ...(subj.vedlejsi_kod_CPV ?? []),
    ...cats.map((c) => c.predmet_kategorie?.hlavni_kod_CPV),
  ].filter(Boolean);
  if (!cpv.some((c) => CPV.some((p) => c.startsWith(p)))) return null;
  const buyer = zp.zadavatel_zadavaciho_postupu?.zadavatele?.[0] ?? {};
  // konec trvání: datum, nebo začátek + doba (roky/měsíce), nebo bez omezení
  const t = d.doba_trvani ?? {};
  let end = day(t.datum_konce_doby_trvani);
  if (!end && t.datum_zacatku_doby_trvani && t.doba_trvani) {
    const e = new Date(t.datum_zacatku_doby_trvani);
    if (/rok/i.test(t.doba_trvani_jednotka ?? "")) e.setUTCFullYear(e.getUTCFullYear() + Number(t.doba_trvani));
    else if (/měsíc/i.test(t.doba_trvani_jednotka ?? "")) e.setUTCMonth(e.getUTCMonth() + Number(t.doba_trvani));
    else if (/den/i.test(t.doba_trvani_jednotka ?? "")) e.setUTCDate(e.getUTCDate() + Number(t.doba_trvani));
    end = e.toISOString().slice(0, 10);
  }
  const cancelled = Boolean(zp.vysledekZadavacihoPostupuDNS?.oduvodneni_zruseni_zadavaciho_postupu) || /zrušen/i.test(zp.stav ?? "");
  return {
    id: `dns-${d.identifikator_NIPEZ}`,
    title: d.nazev_dynamickeho_nakupniho_systemu,
    buyer: buyer.subjekt?.nazev_subjektu ?? "",
    nuts: buyer.subjekt?.kod_NUTS ?? subj.mista_plneni?.[0]?.nuts ?? null,
    started: day(t.datum_zacatku_doby_trvani ?? zp.datum_zahajeni_zadavaciho_postupu),
    end,
    cancelled,
    cpv: [...new Set(cpv)],
    categories: cats.map((c) => c.predmet_kategorie?.popis_predmetu?.slice(0, 160)).filter(Boolean).slice(0, 10),
    description: (subj.popis_predmetu ?? "").slice(0, 800),
    url:
      zp.specifikace_podani?.internetova_adresa_pro_podani ??
      zp.informace_o_zadavaci_dokumentaci?.[0]?.zadavaci_dokumentace_je_dostupna_na ??
      buyer.adresa_profilu ??
      "",
    updated: day(d.casova_znacka),
  };
}

async function processFile(stream, kind) {
  const rows = [];
  let n = 0;
  for await (const raw of records(stream)) {
    n++;
    if (kind === "VZ" && !raw.includes("dodavatele_se_kterymi_byla_uzavrena_smlouva")) continue;
    try {
      const rec = JSON.parse(raw);
      if (kind === "VZ") rows.push(...awards(rec));
      else {
        const r = dns(rec);
        if (r) rows.push(r);
      }
    } catch {}
  }
  console.log(`  ${kind}: ${n} záznamů, ${rows.length} z vybraných oborů`);
  return rows;
}

async function download(kind, ym) {
  const [y, m] = ym.split("-");
  const url = `https://isvz.nipez.cz/sites/default/files/content/opendata-rvz/${kind}-${m}-${y}.zip`;
  const dir = mkdtempSync(path.join(tmpdir(), "isvz-"));
  try {
    console.log(`${ym}: stahuji ${url}`);
    const zip = path.join(dir, "data.zip");
    // curl s opakováním: velké soubory ze státního serveru občas spadnou uprostřed
    const r = spawnSync("curl", ["-fsS", "--retry", "3", "--retry-delay", "10", "--max-time", "900", "-A", UA, "-o", zip, url], {
      encoding: "utf8",
    });
    if (r.status !== 0) throw new Error(`curl ${r.status}: ${(r.stderr || "").trim()}`);
    return await processFile(spawn("unzip", ["-p", zip]).stdout, kind);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { months: [], awards: [] };
const prevDns = existsSync(DNS_OUT) ? JSON.parse(readFileSync(DNS_OUT, "utf8")).systems : [];
const done = []; // [měsíc, smlouvy, DNS]
if (process.env.ISVZ_FILE || process.env.ISVZ_DNS_FILE) {
  const { createReadStream } = await import("node:fs");
  const vz = process.env.ISVZ_FILE ? await processFile(createReadStream(process.env.ISVZ_FILE), "VZ") : [];
  const d = process.env.ISVZ_DNS_FILE ? await processFile(createReadStream(process.env.ISVZ_DNS_FILE), "DNS") : [];
  done.push(["soubor", vz, d]);
} else {
  const args = process.argv.slice(2);
  const last = new Date();
  last.setUTCDate(1);
  last.setUTCMonth(last.getUTCMonth() - 1);
  const lastYm = last.toISOString().slice(0, 7);
  for (const ym of args.length ? months(args[0], args[1] ?? args[0]) : [lastYm]) {
    try {
      done.push([ym, await download("VZ", ym), await download("DNS", ym)]);
    } catch (e) {
      console.log(`${ym}: chyba ${e.message}`);
    }
  }
}

const merged = new Map(prev.awards.map((a) => [a.id, a]));
for (const [, rows] of done) for (const r of rows) merged.set(r.id, r);
const cutoff = new Date();
cutoff.setUTCMonth(cutoff.getUTCMonth() - KEEP_MONTHS);
const awardsOut = [...merged.values()]
  .filter((a) => !a.published || a.published >= cutoff.toISOString().slice(0, 10))
  .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
const monthsOut = [...new Set([...prev.months, ...done.map(([ym]) => ym).filter((x) => x !== "soubor")])].sort();
writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), cpv: CPV, months: monthsOut, awards: awardsOut }));
console.log(`Hotovo: ${awardsOut.length} smluv, měsíce ${monthsOut[0] ?? "–"} až ${monthsOut.at(-1) ?? "–"}`);

// DNS: novější záznam téhož systému přepíše starší; zrušené a skončené vypadnou
const today = new Date().toISOString().slice(0, 10);
const systems = new Map(prevDns.map((d) => [d.id, d]));
for (const [, , rows] of done) for (const r of rows) if (!systems.has(r.id) || (r.updated ?? "") >= (systems.get(r.id).updated ?? "")) systems.set(r.id, r);
const dnsOut = [...systems.values()].filter((d) => !d.cancelled && (!d.end || d.end >= today));
writeFileSync(DNS_OUT, JSON.stringify({ updated: new Date().toISOString(), cpv: CPV, systems: dnsOut }));
console.log(`Hotovo: ${dnsOut.length} aktivních dynamických nákupních systémů`);
