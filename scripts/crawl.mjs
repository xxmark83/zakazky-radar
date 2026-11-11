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
import { cleanTenders, uniqueProfiles } from "./lib/clean.mjs";

const LIST = "data/profily-seznam.txt";
const OUT = "data/profily.json";
const STATE = "data/profily-stav.json"; // profil -> den posledního úspěšného stažení
const INACTIVE = "data/profily-neaktivni.json"; // profil -> den, kdy server řekl, že profil není aktivní
const INACTIVE_DAYS = 30; // pak to zkusíme znovu
const FULL = process.argv.includes("--full") || !existsSync(OUT);
const MAX_DAYS = 120;
const BUDGET = Number(process.env.BUDGET_MIN || 45) * 60_000;
const CONCURRENCY = 24;
const PER_HOST = 3;
const TIMEOUT = 60_000;
const UA = "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)";

// Tender arena a eGORDION běží na stejném API (api.tenderarena.cz), které pustí asi 5 dotazů za minutu.
// Vhodné uveřejnění má v robots.txt Crawl-Delay: 30 a při rychlejším tempu nás na čas zablokuje.
// careful = při zablokování (403/503 nebo 3× za sebou bez spojení) dát serveru pro tento běh pokoj.
const GROUP = { "tenderarena.cz": "tenderarena", "egordion.cz": "tenderarena", "vhodne-uverejneni.cz": "vhodne" };
const SLOW = {
  tenderarena: { parallel: 1, gap: 12_500 },
  vhodne: { parallel: 1, gap: 30_000, careful: true },
};

// Opravy zjevně špatných adres z registru. Co není adresa profilu, vynechat (null):
// - Vhodné uveřejnění sbírá scripts/vhodne.mjs z jejich RSS (servery GitHubu blokují a 30 s na profil je moc)
// - NEN s překlepem „nen.nipez/“ bez .cz
// - E-ZAK: „company_detail_N“ je stránka zadavatele, profil je „profile_display_N“; „contract_display_N“
//   a „vzNNN“ jsou jednotlivé zakázky, ne profily
// - e-zakazky.cz s useknutým GUID (registr adresu ořízl)
function normalize(u) {
  if (/vhodne-uverejneni\.cz/i.test(u)) return null;
  u = u.replace(/^(https?:\/\/)nen\.nipez\//i, "$1nen.nipez.cz/").replace(/\/company_detail_(\d+)\.html$/, "/profile_display_$1.html");
  if (/\/contract_display_\d+\.html$|\/vz\d{6,}$/i.test(u)) return null;
  const guid = u.match(/\/Profil-Zadavatele\/([^/?#]*)/i)?.[1];
  if (guid !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(guid)) return null;
  return u;
}

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
class Blocked extends Error {} // 403/503 od opatrného serveru = nechce nás, nechat ho pro tento běh být
class Inactive extends Error {} // E-ZAK „212 No VVZ profile ID“ = zadavatel profil nepoužívá

async function fetchProfile(profile, careful = false) {
  const url = `${profile.replace(/\/+$/, "")}/XMLdataVZ?od=${since(profile)}&do=${doo}`;
  // u opatrných serverů neopakovat hned, další dotaz počká na odstup
  for (let attempt = careful ? 1 : 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { "User-Agent": UA } });
      if (res.status === 429) throw new RateLimited("429");
      if (careful && (res.status === 403 || res.status === 503)) throw new Blocked(String(res.status));
      if (res.status === 212) throw new Inactive("212");
      if (!res.ok) throw new Answered(String(res.status));
      const xml = await res.text();
      if (!xml.includes("<profil")) throw new Answered("není XML profilu");
      return parse(xml, profile);
    } catch (e) {
      if (attempt || e instanceof RateLimited || e instanceof Answered || e instanceof Blocked || e instanceof Inactive) throw e;
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
// stejný profil bývá v registru dvakrát (http i https) – stahujeme ho jen jednou
const { keep: all, dropped } = uniqueProfiles(
  readFileSync(LIST, "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s))
    .map(normalize)
    .filter(Boolean),
  prev,
  state,
);
for (const p of dropped) delete state[p];
const inactive = existsSync(INACTIVE) ? JSON.parse(readFileSync(INACTIVE, "utf8")) : {};
const stillInactive = (p) => inactive[p] && (now - new Date(inactive[p])) / 86400_000 < INACTIVE_DAYS;
const profiles = all.filter((p) => !stillInactive(p)).sort((a, b) => active.has(b) - active.has(a) || (state[a] ?? "").localeCompare(state[b] ?? ""));

let ok = 0;
const failed = {};
const okHost = {};
const down = {};
const streak = {}; // neúspěšná spojení za sebou (u opatrných serverů)
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
      fetchProfile(p, Boolean(lim.careful))
        .then((list) => {
          ok++;
          streak[h] = 0;
          okHost[h] = (okHost[h] ?? 0) + 1;
          state[p] = today;
          delete inactive[p];
          for (const t of list) if (!found.get(t.id) || found.get(t.id).closed) found.set(t.id, t);
        })
        .catch((e) => {
          if (e instanceof RateLimited) {
            // server nás brzdí: počkat minutu a profil zkusit znovu
            nextAt.set(h, Date.now() + 60_000);
            queue.push(p);
            return;
          }
          if (e instanceof Inactive) {
            inactive[p] = today;
            return;
          }
          failed[h] = (failed[h] ?? 0) + 1;
          if (e instanceof Blocked) {
            dead.add(h);
            return;
          }
          if (e instanceof Answered) return;
          if (lim.careful && (streak[h] = (streak[h] ?? 0) + 1) >= 3) dead.add(h);
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
const tenders = cleanTenders([...merged.values()], { today, dropped, maxDays: MAX_DAYS });
// „ok“ = profily stažené v posledních 14 dnech (rotace pomalých serverů trvá několik dní)
const fresh = Object.values(state).filter((d) => (now - new Date(d)) / 86400_000 <= 14).length;

writeFileSync(STATE, JSON.stringify(state));
writeFileSync(INACTIVE, JSON.stringify(inactive));
writeFileSync(
  OUT,
  JSON.stringify({ updated: now.toISOString(), mode: FULL ? "full" : "incremental", profiles: profiles.length, ok: fresh, failed: nFailed(), tenders }),
);
console.log(
  `Hotovo za ${Math.round((Date.now() - started) / 60_000)} min: ${ok} ok, ${nFailed()} chyb, ${skipped} odloženo na příště, ${tenders.length} otevřených zakázek`,
);
console.log(`Neaktivní profily (přeskočeny ${INACTIVE_DAYS} dní): ${Object.keys(inactive).length}`);
console.log("Nedostupné servery:", [...dead]);
console.log("Nejvíc chyb:", Object.entries(failed).sort((a, b) => b[1] - a[1]).slice(0, 10));
