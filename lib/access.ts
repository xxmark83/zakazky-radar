import { combine, PRESETS, selectedPresets } from "./presets";
import { redis } from "./store";
import { currentUser, users, type User } from "./users";

// Co smí ostatní účty hledat: vlastník v Nastavení → Správa účtů vybere oblasti (předvolby) a jestli smí
// upravovat klíčová slova. Kontroluje se i na serveru, takže se to nedá obejít úpravou stránky.
export type Access = { presets: string[] | null; edit: boolean }; // presets null = všechny
const KEY = "zr:admin:access";
const FULL: Access = { presets: null, edit: true };
// nový účet: všechny oblasti, ale bez úprav klíčových slov, dokud vlastník nerozhodne jinak
const DEFAULT: Access = { presets: null, edit: false };

export async function accessMap(): Promise<Record<string, Access>> {
  return redis ? ((await redis.get<Record<string, Access>>(KEY)) ?? {}) : {};
}

export async function accessFor(u?: User): Promise<Access> {
  const user = u ?? (await currentUser());
  if (user.owner) return FULL;
  return { ...DEFAULT, ...(await accessMap())[user.name] };
}

export async function setAccess(name: string, access: Access) {
  if (!redis) throw new Error("Správa účtů potřebuje databázi (Upstash).");
  if (!users().some((u) => u.name === name && !u.owner)) throw new Error("Neznámý účet.");
  const presets = access.presets?.filter((p) => PRESETS.some((x) => x.name === p)) ?? null;
  await redis.set(KEY, { ...(await accessMap()), [name]: { presets, edit: Boolean(access.edit) } });
}

export const allowedPresets = (a: Access) => PRESETS.filter((p) => !a.presets || a.presets.includes(p.name));

/** Smí uživatel hledat s tímto zadáním? Jen povolené oblasti; bez práva úprav přesně jejich text. */
export function allowedForm(a: Access, f: { name?: string; profile?: string; keywords?: string; cpv?: string }) {
  if (!a.presets && a.edit) return true;
  const names = selectedPresets(f.name ?? "");
  if (!names.length || (a.presets && names.some((n) => !a.presets!.includes(n)))) return false;
  if (a.edit) return true;
  const c = combine(PRESETS.map((p) => p.name).filter((n) => names.includes(n)));
  return c.profile === f.profile && c.keywords === f.keywords && c.cpv === f.cpv;
}
