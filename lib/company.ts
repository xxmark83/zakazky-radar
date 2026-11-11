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
};
export type Reference = {
  id: string;
  title: string;
  client: string;
  year: string;
  value: number | null; // Kč bez DPH
  description: string;
  contact: string; // kontakt u objednatele pro ověření reference (jen pokud ho chceš uvádět)
};

export const EMPTY_COMPANY: Company = { ico: "", name: "", address: "", dic: "", person: "", role: "", email: "", phone: "", web: "", bank: "" };

export async function getCompany(): Promise<Company | null> {
  return redis ? await redis.get<Company>(await userKey("company")) : null;
}
export async function saveCompany(c: Company) {
  if (redis) await redis.set(await userKey("company"), { ...EMPTY_COMPANY, ...c });
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
