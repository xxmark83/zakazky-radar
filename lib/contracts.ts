import { allowedPresets, accessFor } from "./access";
import { hlidacGet } from "./hlidac-api";
import { terms } from "./buyer";
import { PRESETS } from "./presets";
import { redis } from "./store";
import { userKey } from "./users";

// Smlouvy sledovaných subjektů: raz denně (a na tlačítko) projdeme Registr smluv přes Hlídač státu
// a najdeme nové uzavřené smlouvy zadaných IČO – jako objednatel i jako dodavatel. U každého subjektu
// jde vybrat „vše“, nebo jen oblasti z „Co hledáš“ (podle jejich klíčových slov v předmětu smlouvy).
const UA = "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)";
// smlouva se zveřejňuje až 30 dní po podpisu, proto je výchozí okno podle podpisu delší; období si volí uživatel
export const PERIODS = [45, 90, 180, 365, 730];
const DEFAULT_DAYS = 45;
const FEED_KEEP = 2000;
const PAGES = 12; // po 25 smlouvách, tj. nejvýš 300 na subjekt a období

export async function getDays(): Promise<number> {
  const d = redis ? Number(await redis.get<number>(await userKey("contractDays"))) : 0;
  return PERIODS.includes(d) ? d : DEFAULT_DAYS;
}
export async function setDays(days: number) {
  if (redis && PERIODS.includes(days)) await redis.set(await userKey("contractDays"), days);
}
export const sinceDay = (days: number) => new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

export type Watched = { ico: string; name: string; filter: "all" | string[]; added: string };
export type SignedContract = {
  id: string;
  ico: string; // sledovaný subjekt
  subject: string;
  role: "objednatel" | "dodavatel";
  counterpart: string;
  title: string;
  value: number | null;
  signed: string | null;
  url: string;
  areas: string[]; // oblasti, do kterých smlouva spadá (podle klíčových slov)
  found: string; // kdy jsme ji našli
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// kmeny klíčových slov každé oblasti (stejné jako u historie zadavatele)
const AREA_TERMS = Object.fromEntries(PRESETS.map((p) => [p.name, terms(p.keywords)]));
export function areasOf(title: string) {
  const f = ` ${norm(title)} `;
  return PRESETS.filter((p) => AREA_TERMS[p.name].some((w) => (w.length <= 3 ? f.includes(` ${w} `) : f.includes(w)))).map((p) => p.name);
}
export const passes = (w: Watched, c: SignedContract) => w.filter === "all" || c.areas.some((a) => w.filter.includes(a));

// ---------- seznam sledovaných ----------
export async function getWatched(): Promise<Watched[]> {
  return redis ? ((await redis.get<Watched[]>(await userKey("contractWatch"))) ?? []) : [];
}
async function saveWatched(list: Watched[]) {
  if (redis) await redis.set(await userKey("contractWatch"), list);
}

/** Filtr podle práv účtu: „vše“ jen bez omezení oblastí, jinak jen povolené oblasti. */
async function allowedFilter(filter: Watched["filter"]): Promise<Watched["filter"]> {
  const a = await accessFor();
  const allowed = allowedPresets(a).map((p) => p.name);
  if (filter === "all") return a.presets ? allowed : "all";
  const ok = filter.filter((f) => allowed.includes(f));
  return ok.length ? ok : a.presets ? allowed : "all";
}

export type Candidate = { ico: string; name: string; address: string; watched: boolean };

// ARES: IČO → jeden subjekt, název → až 6 nejbližších (ať si uživatel vybere správný)
async function aresCandidates(q: string): Promise<Omit<Candidate, "watched">[]> {
  const headers = { "User-Agent": UA, "Content-Type": "application/json" };
  const base = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";
  const addr = (d: any) => String(d?.sidlo?.textovaAdresa ?? "");
  try {
    const digits = q.replace(/\s/g, "");
    if (/^\d{6,8}$/.test(digits)) {
      const ico = digits.padStart(8, "0");
      const res = await fetch(`${base}/${ico}`, { headers, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return [];
      const d = await res.json();
      return [{ ico, name: d.obchodniJmeno ?? ico, address: addr(d) }];
    }
    const res = await fetch(`${base}/vyhledat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ obchodniJmeno: q, pocet: 10 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const list: any[] = (await res.json()).ekonomickeSubjekty ?? [];
    const want = norm(q);
    // přesná shoda názvu první, pak začátek názvu, pak ostatní
    const rank = (n: string) => (norm(n) === want ? 0 : norm(n).startsWith(want) ? 1 : 2);
    return list
      .sort((a, b) => rank(a.obchodniJmeno) - rank(b.obchodniJmeno))
      .slice(0, 6)
      .map((d) => ({ ico: d.ico, name: d.obchodniJmeno, address: addr(d) }));
  } catch {
    return [];
  }
}

/** Krok 1: jen vyhledat (nic se neukládá) – ke každému dotazu nalezené subjekty. */
export async function lookupSubjects(text: string) {
  const parts = text.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 10);
  const watched = new Set((await getWatched()).map((w) => w.ico));
  const found: { query: string; options: Candidate[] }[] = [];
  for (const q of parts) found.push({ query: q, options: (await aresCandidates(q)).map((c) => ({ ...c, watched: watched.has(c.ico) })) });
  return { found };
}

/** Krok 2: sledovat vybrané subjekty (IČO a název z vyhledání). */
export async function addSubjects(list: { ico: string; name: string }[]) {
  const cur = await getWatched();
  const added: Watched[] = [];
  for (const s of list.slice(0, 30)) {
    if (!/^\d{8}$/.test(s.ico) || cur.some((w) => w.ico === s.ico) || added.some((w) => w.ico === s.ico)) continue;
    added.push({ ico: s.ico, name: String(s.name).slice(0, 200), filter: await allowedFilter("all"), added: new Date().toISOString().slice(0, 10) });
  }
  await saveWatched([...cur, ...added]);
  return { added };
}

// Starší záznamy mohou být bez IČO (dřív šlo sledovat jen podle názvu) – ty se poznají podle názvu,
// jinak by nešly odebrat ani upravit.
export async function updateWatched(ico: string, change: { filter?: Watched["filter"]; remove?: boolean; name?: string }) {
  const list = await getWatched();
  const is = (w: Watched) => (ico ? w.ico === ico : !w.ico && w.name === change.name);
  const next = change.remove
    ? list.filter((w) => !is(w))
    : await Promise.all(list.map(async (w) => (is(w) && change.filter ? { ...w, filter: await allowedFilter(change.filter) } : w)));
  await saveWatched(next);
  return next;
}

// ---------- smlouvy z Hlídače státu ----------
async function fetchFor(w: Watched, days: number): Promise<SignedContract[]> {
  const token = process.env.HLIDAC_TOKEN;
  if (!token || !/^\d{8}$/.test(w.ico)) return []; // bez IČO se v registru hledat nedá
  const since = sinceDay(days);
  const out: SignedContract[] = [];
  for (let strana = 1; strana <= PAGES; strana++) {
    const q = new URLSearchParams({ dotaz: `ico:${w.ico} AND podepsano:[${since} TO *]`, strana: String(strana), razeni: "1" });
    const data = await hlidacGet(`https://api.hlidacstatu.cz/api/v2/smlouvy/hledat?${q}`, 3 * 3600).catch(() => null);
    if (!data) break;
    const rows: any[] = data.results ?? [];
    for (const r of rows) {
      const payer = r.platce ?? {};
      const buyer = payer.ico === w.ico;
      const others: any[] = r.prijemce ?? [];
      const withVat = Number(r.hodnotaVcetneDph ?? r.calculatedPriceWithVATinCZK);
      const value = Number(r.hodnotaBezDph) || (withVat ? withVat / 1.21 : 0);
      const title = String(r.predmet ?? "(bez předmětu)").slice(0, 300);
      out.push({
        id: String(r.id),
        ico: w.ico,
        subject: w.name,
        role: buyer ? "objednatel" : "dodavatel",
        counterpart: buyer ? others.map((p) => p.nazev).filter(Boolean).join(", ") : (payer.nazev ?? ""),
        title,
        value: value ? Math.round(value) : null,
        signed: String(r.datumUzavreni ?? "").slice(0, 10) || null,
        url: `https://www.hlidacstatu.cz/Detail/${r.id}`,
        areas: areasOf(title),
        found: new Date().toISOString(),
      });
    }
    if (rows.length < 25) break;
  }
  return out;
}

// nalezené smlouvy si pamatujeme (hash id → smlouva), ať se ukazují v appce a v e-mailu jen jednou
async function feedKey() {
  return userKey("contractFeed");
}
export async function getFeed(): Promise<SignedContract[]> {
  if (!redis) return [];
  const all = (await redis.hgetall<Record<string, SignedContract>>(await feedKey())) ?? {};
  // nejnověji podepsané první (při delším období je „kdy jsme ji našli“ u všech stejné)
  return Object.values(all).sort((a, b) => (b.signed ?? "").localeCompare(a.signed ?? "") || b.found.localeCompare(a.found));
}

/** Projde sledované subjekty a vrátí smlouvy, které jsme ještě neviděli (a uloží je do přehledu). */
export async function checkContracts(): Promise<SignedContract[]> {
  if (!redis) return [];
  const watched = await getWatched();
  const days = await getDays();
  const key = await feedKey();
  const known = new Set(Object.keys((await redis.hgetall<Record<string, unknown>>(key)) ?? {}));
  const fresh: SignedContract[] = [];
  for (const w of watched) {
    for (const c of await fetchFor(w, days).catch(() => [])) {
      const id = `${w.ico}:${c.id}`;
      if (known.has(id) || !passes(w, c)) continue;
      known.add(id);
      fresh.push(c);
    }
  }
  if (fresh.length) {
    await redis.hset(key, Object.fromEntries(fresh.map((c) => [`${c.ico}:${c.id}`, c])));
    // jen posledních FEED_KEEP
    const feed = await getFeed();
    const old = feed.slice(FEED_KEEP).map((c) => `${c.ico}:${c.id}`);
    if (old.length) await redis.hdel(key, ...old);
  }
  return fresh;
}
