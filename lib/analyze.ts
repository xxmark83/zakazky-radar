import { askJson, type AiResult, type ModelChoice } from "./ai";
import type { Analysis, Draft, Tender } from "./types";

const UA = "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)";

const list = { type: "array", items: { type: "string" } } as const;
const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    requirements: list,
    risks: list,
    verdict: { type: "string", enum: ["go", "consider", "skip"] },
    verdictReason: { type: "string" },
    offer: { type: "string" },
    questions: list,
  },
  required: ["summary", "requirements", "risks", "verdict", "verdictReason", "offer", "questions"],
  additionalProperties: false,
} as const;

const SYSTEM = `Jsi zkušený bid manažer pro české veřejné zakázky. Pomáháš malé firmě s levnými SaaS aplikacemi rozhodnout, jestli podat nabídku.
Dostaneš popis nabídky dodavatele, údaje o zakázce a text stránky zakázky (může být neúplný). Odpovídej česky, stručně a konkrétně, nic si nevymýšlej – co ve vstupu není, označ jako „neuvedeno, ověřit v dokumentaci“.
- summary: 2–3 věty, co přesně zadavatel chce koupit.
- requirements: kvalifikace a podmínky (obrat, reference, certifikace, lhůty plnění, jistota, způsob podání). Max 8 bodů.
- risks: co může malé firmě zlomit vaz. Max 5 bodů.
- verdict: go = podat, consider = zvážit / jít jako subdodavatel, skip = nechat být. verdictReason: jedna věta proč.
- offer: co konkrétně z produktů dodavatele nabídnout a jak se odlišit, 2–4 věty.
- questions: dotazy na zadavatele (vysvětlení zadávací dokumentace), které by stálo za to položit. Max 4.`;

// text stránky zakázky (detail na NEN, profilu zadavatele, TED) – bez skriptů a značek
export async function pageText(url: string): Promise<string> {
  if (!/^https:\/\//.test(url)) return "";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": UA } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return "";
    const html = await res.text();
    return html
      .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 15_000);
  } catch {
    return "";
  }
}

const tenderInfo = (t: Tender) => ({
  nazev: t.title,
  zadavatel: t.buyer,
  zdroj: t.source,
  hodnota: t.value ? `${Math.round(t.value).toLocaleString("cs-CZ")} ${t.currency ?? ""}` : "neuvedeno",
  lhuta: t.deadline ?? "neuvedena",
  cpv: t.cpv.join(", "),
  popis: t.description,
});

export async function analyzeTender(profile: string, t: Tender, model: ModelChoice): Promise<AiResult<Analysis>> {
  const page = await pageText(t.url);
  return askJson<Analysis>({
    model,
    system: SYSTEM,
    schema: SCHEMA,
    effort: "medium",
    content: `MOJE NABÍDKA:\n${profile}\n\nZAKÁZKA:\n${JSON.stringify(tenderInfo(t))}\n\nTEXT STRÁNKY ZAKÁZKY:\n${page || "(nepodařilo se načíst)"}`,
  });
}

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    outline: {
      type: "array",
      items: {
        type: "object",
        properties: { heading: { type: "string" }, points: { type: "array", items: { type: "string" } } },
        required: ["heading", "points"],
        additionalProperties: false,
      },
    },
    coverLetter: { type: "string" },
  },
  required: ["outline", "coverLetter"],
  additionalProperties: false,
} as const;

const DRAFT_SYSTEM = `Jsi zkušený autor nabídek do českých veřejných zakázek. Pro malou firmu se SaaS aplikacemi připrav podklad nabídky.
- outline: osnova nabídky (5–8 kapitol, např. Porozumění potřebám zadavatele, Navrhované řešení, Harmonogram implementace, Podpora a SLA, Reference a tým, Cena). Ke každé 2–5 konkrétních bodů šitých na tuto zakázku a produkty dodavatele.
- coverLetter: krátký průvodní dopis (do 200 slov), věcný, bez frází, s oslovením zadavatele a místy k doplnění v hranatých závorkách, např. [jméno jednatele].
Piš česky. Nevymýšlej si reference, čísla ani certifikace – kde chybí, nech místo k doplnění v hranatých závorkách.`;

export async function draftOffer(profile: string, t: Tender, analysis: Analysis | null, model: ModelChoice) {
  return askJson<Draft>({
    model,
    system: DRAFT_SYSTEM,
    schema: DRAFT_SCHEMA,
    effort: "medium",
    content: `MOJE NABÍDKA:\n${profile}\n\nZAKÁZKA:\n${JSON.stringify(tenderInfo(t))}${
      analysis ? `\n\nROZBOR ZAKÁZKY:\n${JSON.stringify(analysis)}` : ""
    }`,
  });
}
