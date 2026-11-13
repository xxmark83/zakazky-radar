import { createHash } from "node:crypto";
import { bare } from "./match";
import type { Tender } from "./types";

// Stejná zakázka bývá ve více zdrojích (TED, NEN, Hlídač státu, profil zadavatele, Tender arena) a v každém
// má jiné id. Tady se takové záznamy poznají (stejný název a zadavatel, bez diakritiky a interpunkce)
// a spojí do jednoho, který si z každého vezme to nejlepší (popis, CPV, lhůtu, hodnotu).

// „DIAMO, státní podnik“ a „DIAMO, státní podnik, odštěpný závod Příbram“ je tentýž zadavatel;
// „Krajské ředitelství policie Jihočeského kraje“ a „… Plzeňského kraje“ ne (dřív se porovnávalo jen 12 znaků).
function sameBuyer(a: string, b: string) {
  if (a === b) return true;
  if (!a || !b) return false;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 8 && long.startsWith(`${short} `);
}

// Evidenční číslo zakázky na profilu zadavatele („P26V00000073“, „VZ-855“) a systém, ve kterém platí
// (doména profilu bez „www“ a „sluzby“ – tentýž profil mívá několik adres). Id z profilů = „pz-<adresa profilu>#<číslo>“.
// Čísla z různých systémů se porovnat nedají, proto jen v rámci jedné domény.
export function evidence(t: Pick<Tender, "id">): { system: string; code: string } | null {
  const m = t.id.match(/^pz-(https?:\/\/[^#]+)#([^#]+)$/);
  if (!m) return null;
  try {
    const host = new URL(m[1]).hostname.toLowerCase().split(".").slice(-2).join(".");
    return { system: host, code: m[2].trim().toUpperCase() };
  } catch {
    return null;
  }
}
const evKey = (e: { system: string; code: string }) => `${e.system}#${e.code}`;

/**
 * Rozdělí zakázky do skupin „tatáž zakázka“. Pořadí skupin i členů odpovídá pořadí na vstupu.
 * Stejný název a zadavatel nestačí, když má záznam v tomtéž systému jiné evidenční číslo: to je jiné řízení
 * (typicky znovu vyhlášená zakázka) a nesmí zdědit stav, skóre ani „už odesláno e-mailem“ toho prvního.
 */
export function cluster(tenders: Tender[]): Tender[][] {
  const byTitle = new Map<string, { buyers: string[]; members: Tender[]; ev: Map<string, string> }[]>();
  const out: Tender[][] = [];
  for (const t of tenders) {
    const title = bare(t.title);
    const buyer = bare(t.buyer);
    // bez názvu nebo s příliš krátkým názvem se nedá poznat, že jde o totéž
    const groups = title.length >= 8 && title !== "bez nazvu" ? (byTitle.get(title) ?? byTitle.set(title, []).get(title)!) : [];
    const e = evidence(t);
    // skupina se stejným zadavatelem, která v systému tohoto záznamu nemá jiné číslo
    const fits = (x: { ev: Map<string, string> }) => !e || !x.ev.has(e.system) || x.ev.get(e.system) === e.code;
    const same = groups.filter((x) => x.buyers.some((b) => sameBuyer(b, buyer)));
    // záznam s číslem jde nejdřív ke skupině se stejným číslem, teprve pak k té bez čísla z jeho systému
    const g = (e && same.find((x) => x.ev.get(e.system) === e.code)) || same.find(fits);
    if (g) {
      g.buyers.push(buyer);
      g.members.push(t);
      if (e) g.ev.set(e.system, e.code);
    } else {
      const members = [t];
      groups.push({ buyers: [buyer], members, ev: new Map(e ? [[e.system, e.code]] : []) });
      out.push(members);
    }
  }
  return out;
}

/** Ostatní řízení se stejným názvem a zadavatelem (jiné evidenční číslo) – appka je ukáže jako související. */
export function related(clusters: Tender[][]): Map<Tender[], { code: string; published: string | null }[]> {
  const byName = new Map<string, Tender[][]>();
  for (const c of clusters) {
    const k = `${bare(c[0].title)}|${bare(c[0].buyer)}`;
    byName.set(k, [...(byName.get(k) ?? []), c]);
  }
  const out = new Map<Tender[], { code: string; published: string | null }[]>();
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    const info = (c: Tender[]) => {
      const m = c.find((t) => evidence(t));
      return { code: m ? evidence(m)!.code : "", published: c.map((t) => t.published).filter(Boolean).sort()[0] ?? null };
    };
    for (const c of list) out.set(c, list.filter((x) => x !== c).map(info).filter((x) => x.code));
  }
  return out;
}

const richness = (t: Tender) => (t.description.trim() ? 4 : 0) + (t.cpv.length ? 2 : 0) + (t.value ? 1 : 0);

/** Jeden záznam ze skupiny: základ je ten nejúplnější, chybějící údaje doplní ostatní. */
export function merge(members: Tender[], id: string): Tender {
  if (members.length === 1) return members[0].id === id ? members[0] : { ...members[0], id };
  const sorted = [...members].sort((a, b) => richness(b) - richness(a));
  const main = sorted[0];
  const pick = <K extends keyof Tender>(k: K) => sorted.find((t) => t[k] !== null && t[k] !== undefined && t[k] !== "")?.[k] ?? main[k];
  const withValue = sorted.find((t) => t.value);
  return {
    ...main,
    id,
    buyer: pick("buyer"),
    published: members.map((t) => t.published).filter((d): d is string => Boolean(d)).sort()[0] ?? null,
    deadline: pick("deadline"),
    value: withValue?.value ?? null,
    currency: withValue?.currency ?? main.currency,
    cpv: sorted.find((t) => t.cpv.length)?.cpv ?? [],
    region: pick("region"),
    country: pick("country"),
  };
}

const field = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);
/**
 * Klíče, pod kterými si pamatujeme stálé id zakázky: podle id z každého zdroje a podle názvu se zadavatelem.
 * Záznam s evidenčním číslem má číslo i v klíči podle názvu – znovu vyhlášená zakázka (jiné číslo) tak dostane
 * vlastní id a nepřevezme staré „Ne“.
 */
export const canonFields = (t: Tender) => {
  const e = evidence(t);
  return [field(`i:${t.id}`), field(`k:${bare(t.title)}|${bare(t.buyer)}${e ? `|${evKey(e)}` : ""}`)];
};

/**
 * Vybere každé skupině stálé id. Když už zakázku známe (z kteréhokoli zdroje), zůstane jí id, pod kterým
 * se ukázala poprvé – i když dnes přišla jen z jiného zdroje. Díky tomu sedí stavy (nechci / připravuji),
 * paměť AI skóre i seznam zakázek už poslaných e-mailem. `known` = uložené přiřazení z databáze.
 * Vrací spojené zakázky a nová přiřazení k uložení.
 * Když si o stejné uložené id řeknou dvě skupiny (dřív se dvě řízení se stejným názvem spojila do jednoho),
 * nechá si ho ta dřív zveřejněná; druhá dostane vlastní id a ukáže se jako nová.
 */
export function assignIds(clusters: Tender[][], known: Record<string, string>) {
  const used = new Set<string>();
  const save: Record<string, string> = {};
  const rel = related(clusters);
  const first = (c: Tender[]) => c.map((t) => t.published).filter(Boolean).sort()[0] ?? "9999";
  const ids = new Map<Tender[], string>();
  for (const members of [...clusters].sort((a, b) => first(a).localeCompare(first(b)))) {
    const fields = members.map(canonFields);
    // napřed podle id, potom podle názvu a zadavatele
    const hit = [...fields.map((f) => known[f[0]]), ...fields.map((f) => known[f[1]])].find((id) => id && !used.has(id));
    const id = hit ?? members.find((m) => !used.has(m.id))?.id ?? members[0].id;
    used.add(id);
    ids.set(members, id);
    for (const f of fields.flat()) if (known[f] !== id) save[f] = id;
  }
  const tenders = clusters.map((members) => {
    const t = merge(members, ids.get(members)!);
    const r = rel.get(members);
    return r?.length ? { ...t, related: r } : t;
  });
  return { tenders, save };
}
