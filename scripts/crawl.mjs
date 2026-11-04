// Zberač zakázek ze všech profilů zadavatelů v ČR.
// Každý profil (Tender arena, eGORDION, E-ZAK krajů a měst, NEN, Vhodné uveřejnění, …) musí podle
// vyhlášky 345/2023 Sb. vydávat stejné XML: <adresa profilu>/XMLdataVZ?od=DDMMRRRR&do=DDMMRRRR.
// Seznam profilů (data/profily-seznam.txt) pochází z otevřených dat Registru veřejných zakázek.
// Výsledek: data/profily.json – jen zakázky, do kterých lze právě podat nabídku.
//
// node scripts/crawl.mjs          – přírůstek (změny za poslední 3 dny) sloučený s minulým během
// node scripts/crawl.mjs --full   – vše změněné za posledních 120 dní (první naplnění)

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const LIST = "data/profily-seznam.txt";
const OUT = "data/profily.json";
const FULL = process.argv.includes("--full") || !existsSync(OUT);
const DAYS = FULL ? 120 : 3;
const CONCURRENCY = 24;
const PER_HOST = 3;
const TIMEOUT = 60_000;

const ddmmyyyy = (d) =>
  `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;
const now = new Date();
const od = ddmmyyyy(new Date(now.getTime() - DAYS * 86400_000));
const doo = ddmmyyyy(now);
const today = now.toISOString().slice(0, 10);

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
};
const tags = (xml, name) => [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);

function parse(xml, profile) {
  const buyer = tag(xml.match(/<zadavatel>[\s\S]*?<\/zadavatel>/)?.[0] ?? "", "nazev_zadavatele");
  const out = [];
  for (const z of tags(xml, "zakazka")) {
    const idObj = tag(z, "id_objektu");
    const id = `pz-${tag(z, "id_nipez") || `${profile}#${idObj}`}`;
    const states = tags(z, "stav_zadavaciho_postupu").map(decode);
    // ukončené vracíme jako closed, aby je přírůstkový běh odstranil
    if (!states.includes("zahájen")) {
      out.push({ id, closed: true });
      continue;
    }
    // lhůta pro nabídky (u užších řízení žádosti o účast)
    const deadlines = tags(z, "lhuta")
      .filter((l) => /nabídk|žádost/.test(tag(l, "druh_lhuty")))
      .map((l) => tag(l, "datum_konce_lhuty").slice(0, 10))
      .filter(Boolean)
      .sort();
    const deadline = deadlines.find((d) => d >= today) ?? deadlines.at(-1) ?? null;
    if (deadline && deadline < today) {
      out.push({ id, closed: true });
      continue;
    }
    const published = tags(z, "datum_uverejneni").map((d) => decode(d).slice(0, 10)).sort()[0] ?? null;
    out.push({
      id,
      title: tag(z, "nazev_vz"),
      buyer,
      published,
      deadline,
      regime: tag(z, "rezim_vz"),
      cpv: tag(z, "hlavni_cpv"),
      description: tag(z, "predmet_vz").slice(0, 600),
      url: profile,
    });
  }
  return out;
}

async function fetchProfile(profile) {
  const url = `${profile.replace(/\/+$/, "")}/XMLdataVZ?od=${od}&do=${doo}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { "User-Agent": "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)" } });
      if (!res.ok) throw new Error(String(res.status));
      const xml = await res.text();
      if (!xml.includes("<profil")) throw new Error("není XML profilu");
      return parse(xml, profile);
    } catch (e) {
      if (attempt) throw e;
    }
  }
}

const profiles = [...new Set(readFileSync(LIST, "utf8").split("\n").map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s)))];
const host = (u) => new URL(u).host.replace(/^www\./, "");
const active = new Map();
let ok = 0;
const failed = {};
const found = new Map();

// fronta s limitem celkem i na jeden server (Tender arena hostí tisíce profilů)
await new Promise((resolve) => {
  let i = 0;
  let running = 0;
  const next = () => {
    if (i >= profiles.length && running === 0) return resolve();
    while (running < CONCURRENCY && i < profiles.length) {
      const idx = profiles.findIndex((p, k) => k >= i && (active.get(host(p)) ?? 0) < PER_HOST);
      if (idx === -1) break;
      [profiles[i], profiles[idx]] = [profiles[idx], profiles[i]];
      const p = profiles[i++];
      const h = host(p);
      active.set(h, (active.get(h) ?? 0) + 1);
      running++;
      fetchProfile(p)
        .then((list) => {
          ok++;
          for (const t of list) if (!found.get(t.id) || found.get(t.id).closed) found.set(t.id, t);
        })
        .catch(() => (failed[h] = (failed[h] ?? 0) + 1))
        .finally(() => {
          active.set(h, active.get(h) - 1);
          running--;
          if ((ok + Object.values(failed).reduce((a, b) => a + b, 0)) % 250 === 0)
            console.log(`${ok} ok, ${Object.values(failed).reduce((a, b) => a + b, 0)} chyb, ${[...found.values()].filter((t) => !t.closed).length} otevřených`);
          next();
        });
    }
  };
  next();
});

// sloučení s minulým během: změněné zakázky přepíšeme, ukončené (už nejsou „zahájen“) a prošlé vypadnou
const prev = !FULL && existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")).tenders : [];
const merged = new Map(prev.map((t) => [t.id, t]));
for (const t of found.values()) {
  if (t.closed) merged.delete(t.id);
  else merged.set(t.id, t);
}
const tenders = [...merged.values()].filter((t) => !t.deadline || t.deadline >= today);
const nFailed = Object.values(failed).reduce((a, b) => a + b, 0);

writeFileSync(
  OUT,
  JSON.stringify({ updated: now.toISOString(), mode: FULL ? "full" : "incremental", profiles: profiles.length, ok, failed: nFailed, tenders }),
);
console.log(`Hotovo: ${profiles.length} profilů, ${ok} ok, ${nFailed} chyb, ${tenders.length} otevřených zakázek`);
console.log("Nejvíc chyb:", Object.entries(failed).sort((a, b) => b[1] - a[1]).slice(0, 10));
