import { askJson, type AiResult, type ModelChoice } from "./ai";
import { fetchDocs, type Doc } from "./docs";
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
    checklist: list,
    criteria: list,
  },
  required: ["summary", "requirements", "risks", "verdict", "verdictReason", "offer", "questions", "checklist", "criteria"],
  additionalProperties: false,
} as const;

const SYSTEM = `Jsi zkušený bid manažer pro české veřejné zakázky. Pomáháš malé firmě s levnými SaaS aplikacemi rozhodnout, jestli podat nabídku.
Dostaneš popis nabídky dodavatele, údaje o zakázce a zadávací dokumentaci (PDF a texty), případně jen text stránky zakázky.
Dokumentace má přednost – odkazuj na konkrétní požadavky z ní (čísla článků, přílohy). Odpovídej česky, stručně a konkrétně, nic si nevymýšlej – co ve vstupu není, označ jako „neuvedeno, ověřit v dokumentaci“.
- summary: 2–3 věty, co přesně zadavatel chce koupit.
- requirements: kvalifikace a podmínky (obrat, reference, certifikace, lhůty plnění, jistota, způsob podání). Max 8 bodů.
- risks: co může malé firmě zlomit vaz. Max 5 bodů.
- verdict: go = podat, consider = zvážit / jít jako subdodavatel, skip = nechat být. verdictReason: jedna věta proč.
- offer: co konkrétně z produktů dodavatele nabídnout a jak se odlišit, 2–4 věty.
- questions: dotazy na zadavatele (vysvětlení zadávací dokumentace), které by stálo za to položit. Max 4.
- checklist: co konkrétně připravit a přiložit k nabídce (doklady o kvalifikaci, čestná prohlášení, reference, formuláře,
  vyplněné přílohy, podpis, způsob a místo podání). Krátké položky ve tvaru „udělat co“, max 12. Jen z podkladů.
- criteria: hodnoticí kritéria s vahami (např. „Cena 70 %“), nebo prázdné, když v podkladech nejsou.`;

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

// dokumenty jako bloky pro Claude: PDF čte sám (i tabulky), Word posíláme jako text
const blocks = (docs: Doc[]) =>
  docs.map((d) =>
    "pdf" in d
      ? { type: "document", title: d.name, source: { type: "base64", media_type: "application/pdf", data: d.pdf } }
      : { type: "text", text: `DOKUMENT „${d.name}“ (${d.type || "příloha"}):\n${d.text}` },
  );

/** Rozbor zakázky. Dokumentaci najde sama (profil zadavatele, stránka zakázky), nebo použije nahrané soubory. */
export async function analyzeTender(profile: string, t: Tender, model: ModelChoice, uploads: Doc[] = []): Promise<AiResult<Analysis>> {
  const docs = uploads.length ? uploads : await fetchDocs(t);
  const page = docs.length ? "" : await pageText(t.url);
  const intro = `MOJE NABÍDKA:\n${profile}\n\nZAKÁZKA:\n${JSON.stringify(tenderInfo(t))}\n\n${
    docs.length ? `ZADÁVACÍ DOKUMENTACE (${docs.length} souborů) následuje.` : `TEXT STRÁNKY ZAKÁZKY:\n${page || "(nepodařilo se načíst)"}`
  }`;
  const ask = (list: Doc[]) =>
    askJson<Analysis>({
      model,
      system: SYSTEM,
      schema: SCHEMA,
      effort: "medium",
      content: list.length ? [{ type: "text", text: intro }, ...blocks(list)] : intro,
    });
  let used = docs;
  let r: AiResult<Analysis>;
  try {
    r = await ask(used);
  } catch (e) {
    // moc stran nebo velké PDF: zkusit jen první PDF (a texty z Wordu), u jediného PDF jen texty
    const pdfs = docs.filter((d) => "pdf" in d);
    if (!pdfs.length) throw e;
    const texts = docs.filter((d) => !("pdf" in d));
    used = pdfs.length > 1 ? [pdfs[0], ...texts] : texts;
    r = await ask(used);
  }
  return { ...r, data: { ...r.data, sources: used.map((d) => d.name) } };
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
