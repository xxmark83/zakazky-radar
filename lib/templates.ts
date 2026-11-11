import type { Block } from "./docx";
import type { Company, Reference } from "./company";

// Vzory dokumentů nabídky vyplněné z firemního profilu. Jsou to obecné vzory: když zadavatel přiloží
// vlastní formulář, má přednost jeho (každá šablona to připomene).
type T = { title: string; buyer: string; url: string; deadline: string | null };

const fill = (v: string, label: string) => v.trim() || `[${label}]`;
const today = () => new Date().toLocaleDateString("cs-CZ");
const money = (v: number | null) => (v ? `${Math.round(v).toLocaleString("cs-CZ")} Kč bez DPH` : "[hodnota]");

function supplier(c: Company): Block[] {
  return [
    {
      p: [
        `Dodavatel: ${fill(c.name, "obchodní firma / jméno")}`,
        `Sídlo: ${fill(c.address, "sídlo")}`,
        `IČO: ${fill(c.ico, "IČO")}${c.dic ? `, DIČ: ${c.dic}` : ""}`,
        `Osoba oprávněná jednat: ${fill(c.person, "jméno")}${c.role ? `, ${c.role}` : ""}`,
        `Kontakt: ${[c.email, c.phone].filter(Boolean).join(", ") || "[e-mail, telefon]"}`,
        ...(c.bank ? [`Bankovní spojení: ${c.bank}`] : []),
      ].join("\n"),
    },
  ];
}

const signature = (c: Company): Block => ({
  p: `V [místo] dne ${today()}\n\n\n.................................................\n${fill(c.person, "jméno")}${c.role ? `, ${c.role}` : ""}\n${fill(c.name, "dodavatel")}`,
});
const note = (): Block => ({
  p: "Pozn.: obecný vzor. Pokud zadavatel přiložil k zadávací dokumentaci vlastní formulář, použij jeho.",
  muted: true,
});

export function coverSheet(t: T, c: Company, price: number | null): Block[] {
  return [
    { h1: "Krycí list nabídky" },
    { h2: "Veřejná zakázka" },
    { p: `Název: ${t.title}\nZadavatel: ${t.buyer}\nOdkaz: ${t.url}` },
    { h2: "Dodavatel" },
    ...supplier(c),
    { h2: "Nabídková cena" },
    {
      p: `Celková nabídková cena bez DPH: ${price ? money(price) : "[cena bez DPH]"}\nDPH: [DPH]\nCelková nabídková cena s DPH: [cena s DPH]`,
    },
    signature(c),
    note(),
  ];
}

// § 74 odst. 1 zákona č. 134/2016 Sb., o zadávání veřejných zakázek – základní způsobilost
export function eligibility(t: T, c: Company): Block[] {
  return [
    { h1: "Čestné prohlášení o splnění základní způsobilosti" },
    { p: `k veřejné zakázce „${t.title}“, zadavatel ${t.buyer}` },
    ...supplier(c),
    {
      p: "Dodavatel tímto čestně prohlašuje, že je způsobilým dodavatelem ve smyslu § 74 odst. 1 zákona č. 134/2016 Sb., o zadávání veřejných zakázek, tedy že:",
    },
    {
      bullets: [
        "nebyl v zemi svého sídla v posledních 5 letech před zahájením zadávacího řízení pravomocně odsouzen pro trestný čin uvedený v příloze č. 3 zákona nebo obdobný trestný čin podle právního řádu země sídla dodavatele (k zahlazeným odsouzením se nepřihlíží),",
        "nemá v České republice ani v zemi svého sídla v evidenci daní zachycen splatný daňový nedoplatek, a to ani ve vztahu ke spotřební dani,",
        "nemá v České republice ani v zemi svého sídla splatný nedoplatek na pojistném nebo na penále na veřejné zdravotní pojištění,",
        "nemá v České republice ani v zemi svého sídla splatný nedoplatek na pojistném nebo na penále na sociální zabezpečení a příspěvku na státní politiku zaměstnanosti,",
        "není v likvidaci, nebylo proti němu vydáno rozhodnutí o úpadku, nebyla vůči němu nařízena nucená správa podle jiného právního předpisu a není v obdobné situaci podle právního řádu země sídla dodavatele.",
      ],
    },
    {
      p: "Je-li dodavatelem právnická osoba, splňuje podmínku podle první odrážky tato právnická osoba a zároveň každý člen jejího statutárního orgánu.",
    },
    signature(c),
    note(),
  ];
}

export function referenceList(t: T, c: Company, refs: Reference[]): Block[] {
  return [
    { h1: "Seznam významných služeb (reference)" },
    { p: `k veřejné zakázce „${t.title}“, zadavatel ${t.buyer}` },
    ...supplier(c),
    ...(refs.length
      ? refs.flatMap((r, i): Block[] => [
          { h2: `${i + 1}. ${r.title}` },
          {
            p: [
              `Objednatel: ${fill(r.client, "objednatel")}`,
              `Rok realizace: ${fill(r.year, "rok")}`,
              `Cena: ${money(r.value)}`,
              `Popis: ${fill(r.description, "popis plnění")}`,
              `Kontakt pro ověření: ${fill(r.contact, "jméno, e-mail, telefon")}`,
            ].join("\n"),
          },
        ])
      : [{ p: "[Doplň reference v Nastavení → Firma a reference.]" }]),
    signature(c),
    note(),
  ];
}
