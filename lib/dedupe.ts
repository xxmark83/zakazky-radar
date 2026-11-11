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

/** Rozdělí zakázky do skupin „tatáž zakázka“. Pořadí skupin i členů odpovídá pořadí na vstupu. */
export function cluster(tenders: Tender[]): Tender[][] {
  const byTitle = new Map<string, { buyers: string[]; members: Tender[] }[]>();
  const out: Tender[][] = [];
  for (const t of tenders) {
    const title = bare(t.title);
    const buyer = bare(t.buyer);
    // bez názvu nebo s příliš krátkým názvem se nedá poznat, že jde o totéž
    const groups = title.length >= 8 && title !== "bez nazvu" ? (byTitle.get(title) ?? byTitle.set(title, []).get(title)!) : [];
    const g = groups.find((x) => x.buyers.some((b) => sameBuyer(b, buyer)));
    if (g) {
      g.buyers.push(buyer);
      g.members.push(t);
    } else {
      const members = [t];
      groups.push({ buyers: [buyer], members });
      out.push(members);
    }
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
/** Klíče, pod kterými si pamatujeme stálé id zakázky: podle id z každého zdroje a podle názvu se zadavatelem. */
export const canonFields = (t: Tender) => [field(`i:${t.id}`), field(`k:${bare(t.title)}|${bare(t.buyer)}`)];

/**
 * Vybere každé skupině stálé id. Když už zakázku známe (z kteréhokoli zdroje), zůstane jí id, pod kterým
 * se ukázala poprvé – i když dnes přišla jen z jiného zdroje. Díky tomu sedí stavy (nechci / připravuji),
 * paměť AI skóre i seznam zakázek už poslaných e-mailem. `known` = uložené přiřazení z databáze.
 * Vrací spojené zakázky a nová přiřazení k uložení.
 */
export function assignIds(clusters: Tender[][], known: Record<string, string>) {
  const used = new Set<string>();
  const save: Record<string, string> = {};
  const tenders = clusters.map((members) => {
    const fields = members.map(canonFields);
    // napřed podle id, potom podle názvu a zadavatele
    const hit = [...fields.map((f) => known[f[0]]), ...fields.map((f) => known[f[1]])].find((id) => id && !used.has(id));
    const id = hit ?? members.find((m) => !used.has(m.id))?.id ?? members[0].id;
    used.add(id);
    for (const f of fields.flat()) if (known[f] !== id) save[f] = id;
    return merge(members, id);
  });
  return { tenders, save };
}
