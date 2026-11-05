import Anthropic from "@anthropic-ai/sdk";
import type { Analysis, Tender } from "./types";

const client = new Anthropic();
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
async function pageText(url: string): Promise<string> {
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

export async function analyzeTender(profile: string, t: Tender): Promise<Analysis> {
  const page = await pageText(t.url);
  const tender = {
    nazev: t.title,
    zadavatel: t.buyer,
    zdroj: t.source,
    hodnota: t.value ? `${Math.round(t.value).toLocaleString("cs-CZ")} ${t.currency ?? ""}` : "neuvedeno",
    lhuta: t.deadline ?? "neuvedena",
    cpv: t.cpv.join(", "),
    popis: t.description,
  };

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `MOJE NABÍDKA:\n${profile}\n\nZAKÁZKA:\n${JSON.stringify(tender)}\n\nTEXT STRÁNKY ZAKÁZKY:\n${page || "(nepodařilo se načíst)"}`,
      },
    ],
  } as any);

  if (response.stop_reason === "refusal") throw new Error("AI rozbor odmítla");
  const text = response.content.flatMap((b: any) => (b.type === "text" ? [b.text] : [])).join("");
  return JSON.parse(text) as Analysis;
}
