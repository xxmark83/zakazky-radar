// Klíč, pod kterým se pamatují AI skóre: text „Co nabízím“ + verze hodnocení.
// Při změně toho, co AI vrací (např. přidaný kraj), zvýšit SCORE_VERSION – zakázky se ohodnotí znovu.
const SCORE_VERSION = "2";

export function profileKey(profile: string) {
  const s = `${SCORE_VERSION}|${profile}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
