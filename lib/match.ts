// Hledání slov v našich stažených datech (profily zadavatelů, Vhodné uveřejnění, DNS).
// Bez diakritiky a velikosti písmen, se zkrácenou koncovkou („zákaznický“ najde i „zákaznického“).
// Na rozdíl od dotazů na NEN tu není žádný limit počtu slov – filtruje se v paměti.
export const bare = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// obecná slova z víceslovných hesel („GAP analýza“, „správa kontaktů“) by našla stovky nesouvisejících zakázek
const GENERIC = new Set([
  "pro", "sprava", "system", "zamestnancu", "obcany", "klientu", "kontaktu",
  "analyza", "testy", "bezpecnost", "tvorba", "stranky", "miru", "online", "zadosti", "elektronicke",
]);
const ALWAYS = ["informacni system", "aplikac", "software"];
// u šestipísmenných jen když končí samohláskou: „webová“ → „webov“ najde i „webových“, ale „portál“ zůstane celý
// (z „porta“ by bylo „important“, „reportáž“…)
const stem = (w: string) => (w.length >= 8 ? w.slice(0, -2) : w.length === 7 || (w.length === 6 && /[aeiouy]$/.test(w)) ? w.slice(0, -1) : w);

export function localTerms(keywords: string[]): string[] {
  const words = keywords
    .flatMap((k) => k.split(/\s+/))
    .map(bare)
    .filter((w) => w.length >= 3 && !GENERIC.has(w))
    .map(stem);
  return [...new Set([...words, ...ALWAYS])];
}

/** Vrátí funkci „obsahuje text některé z hesel?“. Krátké zkratky (SOC, EDR, SIEM, CRM) jen jako celé slovo,
 * jinak by „soc“ našlo „sociální“ a „siem“ Siemens. */
export function matcher(keywords: string[]): (text: string) => boolean {
  const list = localTerms(keywords);
  const short = list.filter((w) => w.length <= 4).map((w) => ` ${w} `);
  const long = list.filter((w) => w.length > 4);
  return (text) => {
    const b = ` ${bare(text)} `;
    return long.some((w) => b.includes(w)) || short.some((w) => b.includes(w));
  };
}
