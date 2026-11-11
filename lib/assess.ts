import { askJson, type ModelChoice } from "./ai";
import type { Company, Reference } from "./company";
import { fetchDocsReport, type Doc } from "./docs";
import { suggestPartners } from "./partners";
import { applyChecks, priceCheck, profileFacts } from "./qualify";
import { pageText } from "./analyze";
import type { Analysis, Assessment, Tender } from "./types";

// Posouzení zakázky – AI projde zadávací podklady, vypíše všechny kvalifikační předpoklady a u každého porovná
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
    contract: {
      type: "array",
      items: {
        type: "object",
        properties: { risk: str, where: str, severity: { type: "string", enum: ["nízké", "střední", "vysoké"] }, note: str },
        required: ["risk", "where", "severity", "note"],
        additionalProperties: false,
      },
    },
    gaps: { type: "array", items: str },
    missingInfo: { type: "array", items: str },
    questions: { type: "array", items: str },
    // dřív samostatný „AI rozbor“ – teď z jednoho čtení dokumentace
    summary: str,
    risks: { type: "array", items: str },
    offer: str,
    criteria: { type: "array", items: str },
    checklist: { type: "array", items: str },
    questionsDeadline: str,
  },
  required: [
    "verdict", "verdictReason", "qualification", "delivery", "contract", "gaps", "missingInfo", "questions",
    "summary", "risks", "offer", "criteria", "checklist", "questionsDeadline",
  ],
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
- contract: smluvní rizika z návrhu smlouvy a obchodních podmínek (nejvýš 8, nejzávažnější první): smluvní pokuty a jejich
  výše, odpovědnost za škodu a její limit, délka záruky, SLA a reakční doby, předání zdrojového kódu a licence, platební
  podmínky a splatnost, jistota nebo bankovní záruka, výpověď a odstoupení. risk = co přesně smlouva říká (s čísly),
  where = článek nebo strana, severity = dopad na malou firmu, note = co s tím (zeptat se zadavatele, započítat do ceny,
  pro malou firmu nepřijatelné). Když návrh smlouvy mezi podklady není, vrať prázdné pole a napiš to do missingInfo.
- verdict: podat = kvalifikaci splní a dílo zvládne; podat s partnerem = chybí něco, co vyřeší poddodavatel/partner;
  nepodávat = zásadní překážka; nejasné = chybí podklady nebo profil. verdictReason: 1–2 věty.
- summary: 2–3 věty, co přesně zadavatel chce koupit.
- risks: co může malé firmě zlomit vaz mimo kvalifikaci a smlouvu (rozsah, termíny, závislost na třetích stranách,
  migrace dat, nejasné zadání). Nejvýš 5 bodů.
- offer: co konkrétně z produktů a služeb dodavatele nabídnout a jak se odlišit, 2–4 věty.
- criteria: hodnoticí kritéria s vahami (např. „Cena 70 %“), nebo prázdné, když v podkladech nejsou.
- checklist: co konkrétně připravit a přiložit k nabídce (doklady o kvalifikaci, čestná prohlášení, reference, formuláře,
  vyplněné přílohy, podpis, způsob a místo podání). Krátké položky ve tvaru „udělat co“, nejvýš 12. Jen z podkladů.
- questionsDeadline: poslední den, kdy lze žádat o vysvětlení zadávací dokumentace, ve tvaru RRRR-MM-DD, jen pokud je
  v podkladech uveden nebo z nich jednoznačně plyne; jinak prázdný řetězec.
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
  type Raw = Assessment & Pick<Analysis, "summary" | "risks" | "offer" | "questionsDeadline"> & { criteria: string[]; checklist: string[] };
  const ask = (list: Doc[]) =>
    askJson<Raw>({
      model: opts.model,
      system: SYSTEM,
      schema: SCHEMA,
      effort: "high",
      maxTokens: 24000,
      content: [
        { type: "text", text: intro },
        ...list.map((d) =>
          "pdf" in d
            ? { type: "document", title: d.name, source: { type: "base64", media_type: "application/pdf", data: d.pdf } }
            : { type: "text", text: `DOKUMENT „${d.name}“:\n${d.text}` },
        ),
      ],
    });
  let r: Awaited<ReturnType<typeof ask>>;
  try {
    r = await ask(docs);
  } catch (e) {
    // moc stran nebo velké PDF: zkusit jen první PDF (a texty z Wordu), u jediného PDF jen texty
    const pdfs = docs.filter((d) => "pdf" in d);
    if (!pdfs.length) throw e;
    const rest = docs.filter((d) => !("pdf" in d));
    const used = pdfs.length > 1 ? [pdfs[0], ...rest] : rest;
    skipped = [...skipped, ...docs.filter((d) => !used.includes(d)).map((d) => ({ name: d.name, why: "AI se celá dokumentace nevešla – přečteno bez tohoto souboru" }))];
    docs = used;
    r = await ask(docs);
  }
  const { summary, risks, offer, criteria, checklist, questionsDeadline, ...assessment } = r.data;
  // čísla (obrat, pojištění, hodnota a stáří referencí) se přepočítají proti profilu – výpočet má přednost před odhadem AI
  const data = applyChecks(assessment, c, opts.references, now);
  // vyjde to cenově? a když něco nesplníme, kdo podobné zakázky vyhrává (možný partner)
  const price = priceCheck(data.delivery.totalMd, c?.dayRate, t.value, t.currency);
  const needPartner = data.verdict === "podat s partnerem" || data.qualification.some((q) => q.status === "nesplněno");
  const partners = needPartner ? suggestPartners(t, c?.name ?? "") : [];
  const sources = docs.map((d) => d.name);
  // „Rozbor“ (shrnutí, rizika, co nabídnout, kritéria, co přiložit) vzniká ze stejného čtení dokumentace
  // a ukládá se zvlášť, protože z něj vychází seznam úkolů, návrh nabídky i lhůta na dotazy.
  const analysis: Analysis = {
    summary,
    requirements: data.qualification.map((q) => q.requirement),
    risks,
    verdict: data.verdict === "podat" ? "go" : data.verdict === "nepodávat" ? "skip" : "consider",
    verdictReason: data.verdictReason,
    offer,
    questions: data.questions,
    checklist,
    criteria,
    sources,
    questionsDeadline: /^\d{4}-\d\d-\d\d/.test(questionsDeadline ?? "") ? questionsDeadline!.slice(0, 10) : undefined,
  };
  return { cost: r.cost, data: { ...data, price, partners, sources, skipped, model: opts.model, at: now.toISOString() } as Assessment, analysis };
}
