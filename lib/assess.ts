import { askJson, type ModelChoice } from "./ai";
import type { Company, Reference } from "./company";
import { fetchDocsReport, type Doc } from "./docs";
import { applyChecks, profileFacts } from "./qualify";
import { pageText } from "./analyze";
import type { Assessment, Tender } from "./types";

// „Zvládneme to?“ – AI projde zadávací podklady, vypíše všechny kvalifikační předpoklady a u každého porovná
// s firemním profilem a referencemi; pak odhadne, jestli a za kolik člověkodní to firma dokáže dodat (naprogramovat).
const str = { type: "string" } as const;
const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["podat", "podat s partnerem", "nepodávat", "nejasné"] },
    verdictReason: str,
    qualification: {
      type: "array",
      items: {
        type: "object",
        properties: {
          area: { type: "string", enum: ["základní", "profesní", "ekonomická", "technická", "jiné"] },
          requirement: str,
          where: str,
          status: { type: "string", enum: ["splněno", "doložit", "nesplněno", "nejasné"] },
          how: str,
          kind: { type: "string", enum: ["obrat", "pojištění", "reference", "certifikát", "tým", "jiné"] },
          amount: { type: "number" },
          count: { type: "integer" },
          years: { type: "integer" },
          refs: { type: "array", items: { type: "integer" } },
        },
        required: ["area", "requirement", "where", "status", "how", "kind", "amount", "count", "years", "refs"],
        additionalProperties: false,
      },
    },
    delivery: {
      type: "object",
      properties: {
        feasible: { type: "string", enum: ["ano", "částečně", "ne"] },
        summary: str,
        parts: {
          type: "array",
          items: {
            type: "object",
            properties: { item: str, how: str, effortMd: { type: "number" }, risk: { type: "string", enum: ["nízké", "střední", "vysoké"] } },
            required: ["item", "how", "effortMd", "risk"],
            additionalProperties: false,
          },
        },
        totalMd: { type: "number" },
        stack: str,
        timeline: str,
      },
      required: ["feasible", "summary", "parts", "totalMd", "stack", "timeline"],
      additionalProperties: false,
    },
    gaps: { type: "array", items: str },
    missingInfo: { type: "array", items: str },
    questions: { type: "array", items: str },
  },
  required: ["verdict", "verdictReason", "qualification", "delivery", "gaps", "missingInfo", "questions"],
  additionalProperties: false,
} as const;

const SYSTEM = `Jsi zkušený bid manažer a technický architekt pro české veřejné zakázky v IT. Posuzuješ, jestli konkrétní
dodavatel (malá firma nebo živnostník) může podat nabídku a zakázku dodat.
Dostaneš: profil dodavatele (firma, co umí, tým, obrat, certifikace), jeho reference, údaje o zakázce a zadávací podklady.
Pravidla:
- Opírej se jen o podklady a profil. Nic si nevymýšlej. Co v profilu chybí, nepovažuj za splněné – dej status „nejasné“
  nebo „doložit“ a do missingInfo napiš, co má dodavatel doplnit do profilu.
- qualification: VŠECHNY kvalifikační předpoklady a podmínky účasti z podkladů – základní způsobilost (§ 74 ZZVZ),
  profesní (§ 77: výpis z OR/ŽR, oprávnění), ekonomická (obrat, pojištění), technická (§ 79: reference s počtem a hodnotou,
  tým a jeho praxe, certifikace ISO, bezpečnostní prověrky), a další podmínky (jistota, prohlídka místa, lhůty plnění,
  sankce, pokud jsou pro malou firmu zásadní). requirement = přesné znění požadavku zkráceně (čísla, počty, částky).
  where = článek, strana nebo příloha, kde to stojí (u PDF text obsahuje značky [str. N]). status:
  splněno = z profilu/referencí je vidět, že splňuje (v how uveď čím – konkrétní reference či údaj);
  doložit = splňuje nebo snadno splní, ale musí dodat doklad (výpis, čestné prohlášení, pojistka);
  nesplněno = z profilu plyne, že nesplňuje (v how navrhni řešení: poddodavatel § 83, společná nabídka, partner, certifikace);
  nejasné = profil to neříká.
  K tomu u každého požadavku vyplň údaje, podle kterých ho aplikace přepočítá proti profilu (čísla nezaokrouhluj, 0 = neuvedeno):
  kind = obrat (minimální obrat), pojištění (pojištění odpovědnosti), reference (významné zakázky/služby/dodávky),
  certifikát, tým, jinak jiné. amount = částka v Kč bez DPH: u obratu požadované minimum, u pojištění požadovaný limit,
  u referencí minimální hodnota JEDNÉ reference. count = počet požadovaných referencí. years = za kolik posledních let
  musí reference být, u obratu počet účetních období. refs = čísla těch referencí ze seznamu REFERENCE DODAVATELE, které
  požadavku odpovídají OBSAHEM (předmět plnění, typ objednatele) – hodnotu a stáří neřeš, ty ověří aplikace. U požadavků
  jiného druhu dej amount, count i years 0 a refs prázdné.
- delivery: zvládne dodavatel dílo technicky? Rozlož předmět plnění na části (item), u každé jak to postavit (how –
  vlastní produkt dodavatele, úprava, nový vývoj, nákup licencí), odhad pracnosti v člověkodnech (effortMd, realisticky,
  vč. analýzy, testů a nasazení) a riziko. totalMd = součet. stack = doporučené technologie. timeline = zda se to vejde
  do požadovaného termínu plnění při velikosti týmu z profilu.
- verdict: podat = kvalifikaci splní a dílo zvládne; podat s partnerem = chybí něco, co vyřeší poddodavatel/partner;
  nepodávat = zásadní překážka; nejasné = chybí podklady nebo profil. verdictReason: 1–2 věty.
- gaps: co přesně chybí k podání a jak to vyřešit (max 6). questions: dotazy na zadavatele, které by pomohly (max 5).
Odpovídej česky, věcně a stručně.`;

export const UPLOAD_MAX = 200_000; // znaků z jednoho nahraného souboru

export async function assessTender(opts: {
  tender: Tender;
  profile: string;
  company: Company | null;
  references: Reference[];
  texts: { name: string; text: string }[];
  model: ModelChoice;
}) {
  const { tender: t, company: c } = opts;
  const now = new Date();
  let docs: Doc[] = opts.texts.filter((d) => d.text.trim()).map((d) => ({ name: d.name, type: "nahráno", text: d.text }));
  // co se nepřečetlo a proč – ukáže se u výsledku, ať je vidět, na čem posouzení stojí
  let skipped = [
    ...opts.texts.filter((d) => !d.text.trim()).map((d) => ({ name: d.name, why: "v souboru není čitelný text (sken bez textové vrstvy?)" })),
    ...opts.texts.filter((d) => d.text.length >= UPLOAD_MAX).map((d) => ({ name: d.name, why: `přečten jen začátek (prvních ${UPLOAD_MAX.toLocaleString("cs-CZ")} znaků)` })),
  ];
  if (!docs.length) {
    const report = await fetchDocsReport(t);
    docs = report.docs;
    skipped = [...skipped, ...report.skipped];
  }
  const page = docs.length ? "" : await pageText(t.url);
  const firm = c
    ? [
        `Firma: ${c.name || "neuvedeno"}, IČO ${c.ico || "neuvedeno"}, ${c.role || ""}`,
        `Co umí a čím disponuje (tým, technologie, obrat, certifikace, pojištění, partneři):\n${c.capabilities?.trim() || "NEUVEDENO – dodavatel to v profilu nemá vyplněné"}`,
      ].join("\n")
    : "Firemní profil není vyplněný.";
  const facts = profileFacts(c, now);
  const refs = opts.references.length
    ? opts.references.map((r, i) => `${i + 1}. ${r.title} – ${r.client}, ${r.year}, ${r.value ? `${Math.round(r.value).toLocaleString("cs-CZ")} Kč bez DPH` : "cena neuvedena"}: ${r.description}`).join("\n")
    : "Žádné reference v knihovně.";
  const intro = [
    `DNEŠNÍ DATUM: ${now.toISOString().slice(0, 10)}`,
    `PROFIL DODAVATELE\n${firm}${facts ? `\nOvěřené údaje z profilu:\n${facts}` : ""}`,
    `CO DODAVATEL NABÍZÍ (produkty a služby)\n${opts.profile || "neuvedeno"}`,
    `REFERENCE DODAVATELE\n${refs}`,
    `ZAKÁZKA\n${JSON.stringify({ nazev: t.title, zadavatel: t.buyer, hodnota: t.value ? `${Math.round(t.value)} ${t.currency ?? ""}` : "neuvedeno", lhuta: t.deadline ?? "neuvedena", url: t.url })}`,
    docs.length ? `ZADÁVACÍ PODKLADY (${docs.length} dokumentů) následují.` : `TEXT STRÁNKY ZAKÁZKY (podklady nejsou k dispozici):\n${page || "(nepodařilo se načíst)"}`,
  ].join("\n\n");
  const content = [
    { type: "text", text: intro },
    ...docs.map((d) =>
      "pdf" in d
        ? { type: "document", title: d.name, source: { type: "base64", media_type: "application/pdf", data: d.pdf } }
        : { type: "text", text: `DOKUMENT „${d.name}“:\n${d.text}` },
    ),
  ];
  const r = await askJson<Assessment>({ model: opts.model, system: SYSTEM, schema: SCHEMA, effort: "high", content, maxTokens: 24000 });
  // čísla (obrat, pojištění, hodnota a stáří referencí) se přepočítají proti profilu – výpočet má přednost před odhadem AI
  const data = applyChecks(r.data, c, opts.references, now);
  return { ...r, data: { ...data, sources: docs.map((d) => d.name), skipped, model: opts.model, at: now.toISOString() } };
}
