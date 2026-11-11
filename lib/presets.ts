import type { Profile } from "./types";

export const PRESETS: Profile[] = [
  {
    name: "CRM a zákaznické portály",
    profile:
      "Nabízím levné cloudové řešení pro zakázky malého rozsahu (zhruba do 3 mil. Kč bez DPH): jednoduché CRM „Kotva“ (evidence kontaktů, klientů, žadatelů, obchodních případů, úkolů, helpdesk) a zákaznické / klientské portály (portál pro občany, klienty nebo partnery – přihlášení, formuláře, žádosti, stav vyřízení, dokumenty, objednávky). Zákazníci: obce, úřady, příspěvkové organizace, státní firmy. Rychlé nasazení, nízká cena, úpravy na míru. Nezajímají mě velké systémové integrace, hardware, stavby ani zakázky pro velké integrátory.",
    keywords:
      "CRM, zákaznický portál, klientský portál, portál pro občany, objednávkový portál, helpdesk, evidence klientů, správa kontaktů, webová aplikace",
    cpv: "48000000 72000000",
  },
  {
    name: "Vzdělávací portál",
    profile:
      "Nabízím vzdělávací portál / LMS: e-learningové kurzy, testy, certifikáty, evidence školení zaměstnanců, povinná školení (BOZP, GDPR, kyberbezpečnost). Ověřeno pilotem pro velkou státní firmu (Česká pošta). Levné SaaS řešení, zakázky malého rozsahu.",
    keywords: "e-learning, LMS, vzdělávací portál, školení zaměstnanců, vzdělávací systém",
    cpv: "80420000 80500000 48190000 72000000",
  },
  {
    name: "Kybernetická bezpečnost",
    profile:
      "Nabízím služby a řešení kybernetické bezpečnosti pro zakázky malého a středního rozsahu: GAP analýzu podle NIS2 a zákona o kybernetické bezpečnosti (vstupní audit, analýza rizik, plán opatření, bezpečnostní dokumentace, ISMS / ISO 27001), SIEM a SOC (sběr a vyhodnocení logů, dohled 24/7, reakce na incidenty), ochranu koncových stanic – endpoint, EDR / XDR, antivirus – a související služby (firewall, skenování zranitelností, penetrační testy, školení bezpečnosti). Zákazníci: obce, úřady, nemocnice, školy, příspěvkové organizace a státní firmy, hlavně nově povinné subjekty podle NIS2. Nezajímají mě fyzická ostraha, kamerové systémy, stavby ani velké dodávky hardwaru.",
    keywords:
      "kybernetická bezpečnost, NIS2, GAP analýza, SIEM, SOC, endpoint, antivirus, EDR, XDR, kyberbezpečnost, firewall, penetrační testy, zranitelnost, ISO 27001",
    cpv: "48730000 48760000 72000000 79417000",
  },
  {
    name: "Zakázky na míru (živnost)",
    profile:
      "Jsem živnostník a vyvíjím software na míru pro zakázky malého rozsahu (do 2 mil. Kč bez DPH, ideálně 50 tis. – 1 mil. Kč): webové a mobilní aplikace (PWA), evidence a databáze (klienti, žádosti, smlouvy, majetek, vozidla, akce), jednoduché CRM a helpdesk, klientské a občanské portály s formuláři a elektronickými žádostmi, rezervační a objednávkové systémy, registrace na akce a kurzy, e-learning a testy, intranety, dashboardy a reporty z dat, mapové aplikace, weby obcí a organizací (i přístupnost WCAG), chatboty a AI asistenty nad dokumenty, napojení systémů přes API a převod dat. Dodávám rychle (týdny), s nízkou cenou a další podporou. Hodí se mi zakázky malého rozsahu, přímé výzvy a poptávky obcí, škol, příspěvkových organizací a menších úřadů. Nehodí se mi velké systémové integrace, atestované systémy (spisová služba, ekonomické systémy), dodávky hardwaru, nepřetržitý provoz 24/7 a zakázky s požadavkem na velký obrat, tým nebo firemní certifikace ISO.",
    keywords:
      "vývoj aplikace, aplikace na míru, software na míru, webová aplikace, mobilní aplikace, webové stránky, rezervační systém, objednávkový systém, evidenční systém, databáze, formulář, portál, intranet, dashboard, chatbot, digitalizace, CRM, helpdesk, e-learning",
    cpv: "72200000 72212000 72262000 72413000 72230000 48000000",
  },
];

// více oblastí najednou: jeden společný popis pro AI, sjednocená klíčová slova a CPV
export const JOIN = " + ";
export const PRESET_SHORT: Record<string, string> = {
  "CRM a zákaznické portály": "CRM a portály",
  "Vzdělávací portál": "Vzdělávání",
  "Kybernetická bezpečnost": "Kyberbezpečnost",
  "Zakázky na míru (živnost)": "Na míru",
};
export const selectedPresets = (name: string) => name.split(JOIN).filter((n) => PRESETS.some((p) => p.name === n));
export function combine(names: string[]) {
  const list = PRESETS.filter((p) => names.includes(p.name));
  if (list.length === 1) return { ...list[0] };
  const uniq = (parts: string[], sep: RegExp) => [...new Set(parts.flatMap((x) => x.split(sep)).map((x) => x.trim()).filter(Boolean))];
  return {
    name: list.map((p) => p.name).join(JOIN),
    profile:
      "Nabízím několik oblastí. Hodnoť každou zakázku podle té, která na ni sedí nejlépe, a v poli product ji uveď.\n\n" +
      list.map((p) => `${p.name}: ${p.profile}`).join("\n\n"),
    keywords: uniq(list.map((p) => p.keywords), /,/).join(", "),
    cpv: uniq(list.map((p) => p.cpv), /[\s,;]+/).join(" "),
  };
}
