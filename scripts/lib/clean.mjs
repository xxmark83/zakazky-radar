// Úklid dat ze sběru profilů (scripts/crawl.mjs). Čisté funkce, ať se dají vyzkoušet nad uloženými daty.

const bare = (s) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const canon = (u) => u.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/{2,}/g, "/").replace(/\/+$/, "");

/**
 * Registr má stovku profilů dvakrát (http i https, s www i bez) – stahovaly se dvakrát a každá jejich zakázka
 * byla v datech dvakrát pod jiným id. Z každé takové skupiny necháme jednu adresu: tu, jejíž zakázky už
 * v datech jsou jako první (ať zakázkám zůstane id, které uživatel zná), jinak už úspěšně staženou, jinak https.
 * Vrací { keep: adresy ke stažení, dropped: Set vyřazených adres }.
 */
export function uniqueProfiles(list, prevTenders = [], state = {}) {
  const firstSeen = new Map();
  prevTenders.forEach((t, i) => {
    if (t.url && !firstSeen.has(t.url)) firstSeen.set(t.url, i);
  });
  const groups = new Map();
  for (const u of list) {
    const k = canon(u);
    if (!groups.has(k)) groups.set(k, []);
    if (!groups.get(k).includes(u)) groups.get(k).push(u);
  }
  const keep = [];
  const dropped = new Set();
  for (const variants of groups.values()) {
    const best = [...variants].sort(
      (a, b) =>
        (firstSeen.get(a) ?? Infinity) - (firstSeen.get(b) ?? Infinity) ||
        Boolean(state[b]) - Boolean(state[a]) ||
        b.startsWith("https://") - a.startsWith("https://"),
    )[0];
    keep.push(best);
    for (const v of variants) if (v !== best) dropped.add(v);
  }
  return { keep, dropped };
}

/**
 * Co ve výsledku nemá být:
 * - zakázky z vyřazených zdvojených adres profilů,
 * - prošlé,
 * - bez lhůty a zveřejněné před víc než maxDays dny: přírůstkový sběr se k nim už nevrací, takže by v datech
 *   visely navždy jako „otevřené“ (plný sběr se stejně dívá jen maxDays zpět),
 * - záznam z rychlého seznamu Tender areny (ta-, bez CPV a popisu), jakmile máme tutéž zakázku z profilu.
 */
export function cleanTenders(tenders, { today, dropped = new Set(), maxDays = 120 }) {
  const oldest = new Date(new Date(today).getTime() - maxDays * 86400_000).toISOString().slice(0, 10);
  const key = (t) => `${bare(t.title)}|${bare(t.buyer)}`;
  const live = tenders.filter(
    (t) => !dropped.has(t.url) && (!t.deadline || t.deadline >= today) && (t.deadline || !t.published || t.published >= oldest),
  );
  const full = new Set(live.filter((t) => !t.id.startsWith("ta-")).map(key));
  // profil neuvádí adresu zakázky – záznam z rychlého seznamu ano, tak ji před vyřazením předá
  const taUrl = new Map(live.filter((t) => t.id.startsWith("ta-")).map((t) => [key(t), t.url]));
  return live
    .filter((t) => !t.id.startsWith("ta-") || !full.has(key(t)))
    .map((t) => (!t.id.startsWith("ta-") && !t.detail && taUrl.has(key(t)) ? { ...t, detail: taUrl.get(key(t)) } : t));
}
