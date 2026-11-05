// Zberač zakázek ze všech profilů zadavatelů v ČR.
// Každý profil (Tender arena, eGORDION, E-ZAK krajů a měst, NEN, Vhodné uveřejnění, …) musí podle
// vyhlášky 345/2023 Sb. vydávat stejné XML: <adresa profilu>/XMLdataVZ?od=DDMMRRRR&do=DDMMRRRR.
// Seznam profilů (data/profily-seznam.txt) pochází z otevřených dat Registru veřejných zakázek.
// Výsledek: data/profily.json – jen zakázky, do kterých lze právě podat nabídku.
//
// node scripts/crawl.mjs          – denní běh: každý profil od jeho posledního úspěšného stažení
// node scripts/crawl.mjs --full   – začít znovu: vše změněné za posledních 120 dní
// BUDGET_MIN=45                   – po kolika minutách přestat brát další profily (zbytek příště)

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const LIST = "data/profily-seznam.txt";
const OUT = "data/profily.json";
const STATE = "data/profily-stav.json"; // profil -> den posledního úspěšného stažení
const FULL = process.argv.includes("--full") || !existsSync(OUT);
const MAX_DAYS = 120;
const BUDGET = Number(process.env.BUDGET_MIN || 45) * 60_000;
const CONCURRENCY = 24;
const PER_HOST = 3;
const TIMEOUT = 60_000;
const UA = "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)";

// Tender arena a eGORDION běží na stejném API (api.tenderarena.cz), které pustí asi 5 dotazů za minutu
const GROUP = { "tenderarena.cz": "tenderarena", "egordion.cz": "tenderarena" };
const SLOW = { tenderarena: { parallel: 1, gap: 12_500 } };

const ddmmyyyy = (d) =>
  `${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}${d.getFullYear()}`;
const now = new Date();
const started = Date.now();
const doo = ddmmyyyy(now);
const today = now.toISOString().slice(0, 10);
const state = !FULL && existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
// od posledního úspěchu (den rezervy), nejvýš 120 dní zpět
const since = (profile) => {
  const last = state[profile] ? new Date(state[profile]).getTime() - 86400_000 : 0;
  return ddmmyyyy(new Date(Math.max(last, now.getTime() - MAX_DAYS * 86400_000)));
};

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
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
};
const tags = (xml, name) =>
  [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);

function parse(xml, profile) {
  const buyer = tag(xml.match(/<zadavatel[\s>][\s\S]*?<\/zadavatel>/)?.[0] ?? "", "nazev_zadavatele");
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

class RateLimited extends Error {}
class Answered extends Error {} // server odpověděl, jen ne XML profilu (špatná adresa v registru)

async function fetchProfile(profile) {
  const url = `${profile.replace(/\/+$/, "")}/XMLdataVZ?od=${since(profile)}&do=${doo}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { "User-Agent": UA } });
      if (res.status === 429) throw new RateLimited("429");
      if (!res.ok) throw new Answered(String(res.status));
      const xml = await res.text();
      if (!xml.includes("<profil")) throw new Answered("není XML profilu");
      return parse(xml, profile);
    } catch (e) {
      if (attempt || e instanceof RateLimited || e instanceof Answered) throw e;
    }
  }
}

const prev = !FULL && existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")).tenders : [];
const host = (u) => {
  const h = new URL(u).host.replace(/^www\./, "");
  return GROUP[h.split(".").slice(-2).join(".")] ?? h;
};
// napřed profily s otevřenými zakázkami, pak ty, které jsme nejdéle nestáhli
const active = new Set(prev.map((t) => t.url));
const all = [...new Set(readFileSync(LIST, "utf8").split("\n").map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s)))];
const profiles = all.sort((a, b) => active.has(b) - active.has(a) || (state[a] ?? "").localeCompare(state[b] ?? ""));

let ok = 0;
const failed = {};
const okHost = {};
const down = {};
const found = new Map();
const running = new Map(); // host -> běžících dotazů
const nextAt = new Map(); // host -> nejdřív kdy smí další dotaz
const dead = new Set(); // hosty, které tento běh vůbec neodpovídají
const queue = [...profiles];
let total = 0;
let skipped = 0;
const nFailed = () => Object.values(failed).reduce((a, b) => a + b, 0);

// fronta s limitem celkem i na jeden server; pomalé servery mají vlastní rozestup dotazů
await new Promise((resolve) => {
  let timer = null;
  const pump = () => {
    clearTimeout(timer);
    const overBudget = Date.now() - started > BUDGET;
    if (overBudget) {
      skipped += queue.length;
      queue.length = 0;
    }
    if (!queue.length && total === 0) return resolve();
    let wait = Infinity;
    for (let i = 0; i < queue.length && total < CONCURRENCY; i++) {
      const p = queue[i];
      const h = host(p);
      if (dead.has(h)) {
        queue.splice(i--, 1);
        skipped++;
        continue;
      }
      const lim = SLOW[h] ?? { parallel: PER_HOST, gap: 0 };
      const at = nextAt.get(h) ?? 0;
      if ((running.get(h) ?? 0) >= lim.parallel) continue;
      if (at > Date.now()) {
        wait = Math.min(wait, at - Date.now());
        continue;
      }
      queue.splice(i--, 1);
      running.set(h, (running.get(h) ?? 0) + 1);
      nextAt.set(h, Date.now() + lim.gap);
      total++;
      fetchProfile(p)
        .then((list) => {
          ok++;
          okHost[h] = (okHost[h] ?? 0) + 1;
          state[p] = today;
          for (const t of list) if (!found.get(t.id) || found.get(t.id).closed) found.set(t.id, t);
        })
        .catch((e) => {
          if (e instanceof RateLimited) {
            // server nás brzdí: počkat minutu a profil zkusit znovu
            nextAt.set(h, Date.now() + 60_000);
            queue.push(p);
            return;
          }
          failed[h] = (failed[h] ?? 0) + 1;
          if (e instanceof Answered) return;
          // 15× se nepřipojíme a nic neprošlo = server nejede, zbytek jeho profilů zkusíme příště
          down[h] = (down[h] ?? 0) + 1;
          if (!okHost[h] && down[h] >= 15) dead.add(h);
        })
        .finally(() => {
          running.set(h, running.get(h) - 1);
          total--;
          if ((ok + nFailed()) % 250 === 0)
            console.log(`${ok} ok, ${nFailed()} chyb, ${[...found.values()].filter((t) => !t.closed).length} otevřených`);
          pump();
        });
    }
    if (wait < Infinity) timer = setTimeout(pump, wait + 50);
  };
  pump();
});

// Tender arena + eGORDION: veřejný seznam všech zakázek zveřejněných za posledních 24 hodin (jeden dotaz
// pro všech ~4 200 zadavatelů). Profily se kvůli limitu API stahují jen pomalu po dnech, takže díky tomu
// žádná nová zakázka neunikne. Seznam nemá CPV ani popis – hledá se v něm podle názvu.
try {
  const res = await fetch("https://api.tenderarena.cz/ta/profil/seznam-zakazek/noveUverejneneZakazky", {
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const day = (ms) => (ms ? new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" }) : null);
  let n = 0;
  for (const z of (await res.json()).polozky ?? []) {
    if (z.stav !== "NEUKONCENA") continue;
    found.set(`ta-${z.id}`, {
      id: `ta-${z.id}`,
      title: z.nazev,
      buyer: z.uredniNazevZadavatele,
      published: today,
      deadline: day(z.lhutaProPodaniNabidek ?? z.lhutaProDoruceniZadostiOUcast),
      regime: "",
      cpv: "",
      description: "",
      url: `https://tenderarena.cz/dodavatel/zakazka/${z.id}`,
    });
    n++;
  }
  console.log(`Tender arena – nové za 24 h: ${n}`);
} catch (e) {
  console.log(`Tender arena – nové za 24 h: chyba ${e.message}`);
}

// sloučení s minulým během: změněné zakázky přepíšeme, ukončené (už nejsou „zahájen“) a prošlé vypadnou
const merged = new Map(prev.map((t) => [t.id, t]));
for (const t of found.values()) {
  if (t.closed) merged.delete(t.id);
  else merged.set(t.id, t);
}
const tenders = [...merged.values()].filter((t) => !t.deadline || t.deadline >= today);
// „ok“ = profily stažené v posledních 14 dnech (rotace pomalých serverů trvá několik dní)
const fresh = Object.values(state).filter((d) => (now - new Date(d)) / 86400_000 <= 14).length;

writeFileSync(STATE, JSON.stringify(state));
writeFileSync(
  OUT,
  JSON.stringify({ updated: now.toISOString(), mode: FULL ? "full" : "incremental", profiles: profiles.length, ok: fresh, failed: nFailed(), tenders }),
);
console.log(
  `Hotovo za ${Math.round((Date.now() - started) / 60_000)} min: ${ok} ok, ${nFailed()} chyb, ${skipped} odloženo na příště, ${tenders.length} otevřených zakázek`,
);
console.log("Nedostupné servery:", [...dead]);
console.log("Nejvíc chyb:", Object.entries(failed).sort((a, b) => b[1] - a[1]).slice(0, 10));
