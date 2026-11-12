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
  // z hesel MM security („test zranitelností“, „revize zdrojového kódu“, „red teaming“…) – samotná nic neříkají
  "test", "testovani", "bezpecnostni", "bezpecnosti", "skenovani", "zdrojoveho", "kodu",
  "review", "teaming", "eticky", "aplikaci",
]);
const ALWAYS = ["informacni system", "aplikac", "software"];
// u šestipísmenných jen když končí samohláskou: „webová“ → „webov“ najde i „webových“, ale „portál“ zůstane celý
// (z „porta“ by bylo „important“, „reportáž“…)
const stem = (w: string) => (w.length >= 8 ? w.slice(0, -2) : w.length === 7 || (w.length === 6 && /[aeiouy]$/.test(w)) ? w.slice(0, -1) : w);

export function localTerms(keywords: string[], always = true): string[] {
  const words = keywords
    .flatMap((k) => k.split(/\s+/))
    .map(bare)
    .filter((w) => w.length >= 3 && !GENERIC.has(w))
    .map(stem);
  return [...new Set([...words, ...(always ? ALWAYS : [])])];
}

/** Vrátí funkci „obsahuje text některé z hesel?“. Krátké zkratky (SOC, EDR, SIEM, CRM) jen jako celé slovo,
 * jinak by „soc“ našlo „sociální“ a „siem“ Siemens. */
// „penetrační“ samo o sobě je i stavařina (penetrační nátěr, penetrace podkladu) – platí jen s „test…“ hned za ním;
// „mobilní“ jsou i telefony a mobilní zábrany – platí jen „mobilní aplikace“. Stejně „audit / revize zdrojového kódu“,
// „code review“ a „red teaming“: první slovo samo nic neříká, dvojice ano.
const NEEDS_NEXT: Record<string, string> = { penetrac: "test", mobiln: "aplik", audit: "zdrojov", reviz: "zdrojov", code: "review", red: "team" };

export function matcher(keywords: string[], always = true): (text: string) => boolean {
  // always = false: jen slova oblasti, bez obecných IT hesel (pro štítek „do které oblasti zakázka patří“)
  // pro štítek oblasti se nepočítají ani kmeny obecných IT hesel („aplika“ z „webová aplikace“, „softwa“)
  const list = localTerms(keywords, always).filter((w) => always || !ALWAYS.some((a) => a.startsWith(w)));
  const short = list.filter((w) => w.length <= 4 && !NEEDS_NEXT[w]).map((w) => ` ${w} `);
  const long = list.filter((w) => w.length > 4 && !NEEDS_NEXT[w]);
  const pairs = list.filter((w) => NEEDS_NEXT[w]).map((w) => new RegExp(` ${w}[a-z]* ${NEEDS_NEXT[w]}`));
  return (text) => {
    const b = ` ${bare(text)} `;
    return long.some((w) => b.includes(w)) || short.some((w) => b.includes(w)) || pairs.some((re) => re.test(b));
  };
}
