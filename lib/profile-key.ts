// Klíč, pod kterým se pamatují AI skóre: text „Co nabízím“ + verze hodnocení.
// Při změně toho, co AI vrací (např. přidaný kraj), zvýšit SCORE_VERSION – zakázky se ohodnotí znovu.
const SCORE_VERSION = "2";

export function profileKey(profile: string) {
  const s = `${SCORE_VERSION}|${profile}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

// Kolik toho AI o zakázce při hodnocení věděla: délka popisu (posílá se nejvýš 800 znaků), hodnota a CPV.
// První hodnocení často vidí jen strohý řádek z NEN; když se později připojí záznam z profilu s popisem,
// uložené skóre je odhad naslepo. Porovnává se „bohatost“, ne otisk textu – popis se mezi zdroji drobně liší
// a každá taková změna by znamenala nové placené hodnocení.
export const richness = (t: { description: string; value: number | null; cpv: string[] }) =>
  Math.min(t.description.trim().length, 800) + (t.value ? 150 : 0) + (t.cpv.length ? 150 : 0);
/** Má se zakázka ohodnotit znovu? Jen když má AI teď znatelně víc údajů než minule. Skóre bez „r“ (starší) platí dál. */
export const stale = (saved: { r?: number }, t: { description: string; value: number | null; cpv: string[] }) =>
  saved.r !== undefined && richness(t) >= saved.r + 150;
