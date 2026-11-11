import { redis } from "./store";
import { userKey } from "./users";

// Firemní profil a knihovna referencí každého účtu: z nich se vyplňují dokumenty nabídky
// (krycí list, čestné prohlášení, seznam referencí) a AI je vybírá do návrhu nabídky.
export type Company = {
  ico: string;
  name: string;
  address: string;
  dic: string;
  person: string; // kdo podepisuje (jednatel, OSVČ)
  role: string; // např. „jednatel“, „podnikatel (OSVČ)“
  email: string;
  phone: string;
  web: string;
  bank: string;
  capabilities?: string; // co firma umí a čím disponuje: tým, technologie, certifikace, obrat, pojištění, partneři
  // čísla pro kvalifikaci – „Zvládneme to?“ je porovnává výpočtem (lib/qualify.ts), ne odhadem AI
  turnover?: Record<string, number | null>; // rok -> obrat v Kč bez DPH
  insurance?: number | null; // limit pojištění odpovědnosti v Kč
  certs?: Cert[];
  team?: Member[];
};
export type Cert = { name: string; until: string }; // until = „RRRR-MM“, prázdné = bez omezení
export type Member = { role: string; years: number | null; note: string }; // role, roky praxe, vzdělání/certifikace
export type Reference = {
  id: string;
  title: string;
  client: string;
  year: string;
  value: number | null; // Kč bez DPH
  description: string;
  contact: string; // kontakt u objednatele pro ověření reference (jen pokud ho chceš uvádět)
};

export const EMPTY_COMPANY: Company = { ico: "", name: "", address: "", dic: "", person: "", role: "", email: "", phone: "", web: "", bank: "", capabilities: "" };

export async function getCompany(): Promise<Company | null> {
  return redis ? await redis.get<Company>(await userKey("company")) : null;
}
const num = (v: unknown) => (Number(v) > 0 ? Math.round(Number(v)) : null);
const text = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
export async function saveCompany(c: Company) {
  if (!redis) return;
  const clean: Company = {
    ...EMPTY_COMPANY,
    ...c,
    turnover: Object.fromEntries(
      Object.entries(c.turnover ?? {})
        .filter(([y]) => /^\d{4}$/.test(y))
        .map(([y, v]) => [y, num(v)]),
    ),
    insurance: num(c.insurance),
    certs: (c.certs ?? []).slice(0, 30).map((x) => ({ name: text(x.name, 120), until: /^\d{4}-\d{2}/.test(x.until ?? "") ? x.until.slice(0, 7) : "" })).filter((x) => x.name),
    team: (c.team ?? []).slice(0, 30).map((m) => ({ role: text(m.role, 120), years: num(m.years), note: text(m.note, 200) })).filter((m) => m.role),
  };
  await redis.set(await userKey("company"), clean);
}
export async function getReferences(): Promise<Reference[]> {
  return redis ? ((await redis.get<Reference[]>(await userKey("references"))) ?? []) : [];
}
export async function saveReferences(list: Reference[]) {
  if (redis) await redis.set(await userKey("references"), list.slice(0, 100));
}

/** Údaje firmy z ARES podle IČO (název, sídlo, DIČ). Kdo podepisuje, doplní uživatel. */
export async function companyFromAres(ico: string): Promise<Partial<Company> | null> {
  const id = ico.replace(/\s/g, "").padStart(8, "0");
  if (!/^\d{8}$/.test(id)) return null;
  try {
    const res = await fetch(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${id}`, {
      headers: { "User-Agent": "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const osvc = d.pravniForma === "101"; // fyzická osoba podnikající
    return {
      ico: id,
      name: d.obchodniJmeno ?? "",
      address: d.sidlo?.textovaAdresa ?? "",
      dic: d.dic ?? "",
      ...(osvc ? { person: d.obchodniJmeno ?? "", role: "podnikatel (OSVČ)" } : {}),
    };
  } catch {
    return null;
  }
}
