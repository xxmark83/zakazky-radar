import Anthropic from "@anthropic-ai/sdk";
import type { ScoredTender, Tender } from "./types";

const client = new Anthropic();
const BATCH = 40;

const SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          score: { type: "integer" },
          product: { type: "string" },
          reason: { type: "string" },
        },
        required: ["id", "score", "product", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
} as const;

const SYSTEM = `Jsi zkušený bid manažer pro české veřejné zakázky. Dostaneš popis nabídky dodavatele (malá firma s levnými SaaS aplikacemi) a seznam zakázek.
Ke každé zakázce vrať:
- score 0–100: jak reálně by dodavatel mohl zakázku vyhrát nebo se na ní podílet (jako hlavní dodavatel či subdodavatel). 80+ = přesně sedí, 50–79 = část plnění sedí, pod 30 = nesouvisí.
  Snižuj skóre, pokud zakázka vyžaduje rozsah, reference nebo obrat, který malá firma nesplní, nebo jde hlavně o hardware/stavbu.
- product: který produkt/služba dodavatele sedí (krátce), nebo "–".
- reason: jedna věta česky, proč.
Vrať výsledek pro každé id ze vstupu.`;

async function scoreBatch(profile: string, batch: Tender[]): Promise<ScoredTender[]> {
  const items = batch.map((t) => ({
    id: t.id,
    nazev: t.title,
    zadavatel: t.buyer,
    hodnota: t.value ? `${Math.round(t.value).toLocaleString("cs-CZ")} ${t.currency ?? ""}` : "neuvedeno",
    cpv: t.cpv.slice(0, 6).join(", "),
    popis: t.description.slice(0, 800),
  }));

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `MOJE NABÍDKA:\n${profile}\n\nZAKÁZKY (JSON):\n${JSON.stringify(items)}`,
      },
    ],
  } as any);

  if (response.stop_reason === "refusal") throw new Error("AI odmítla dávku zpracovat");
  const text = response.content.flatMap((b: any) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed: { results: { id: string; score: number; product: string; reason: string }[] } = JSON.parse(text);
  const byId = new Map(parsed.results.map((r) => [r.id, r]));

  return batch.map((t) => {
    const r = byId.get(t.id);
    return {
      ...t,
      score: r ? Math.max(0, Math.min(100, r.score)) : 0,
      product: r?.product ?? "–",
      reason: r?.reason ?? "AI nevrátila hodnocení",
    };
  });
}

export async function scoreTenders(profile: string, tenders: Tender[]): Promise<ScoredTender[]> {
  const batches: Tender[][] = [];
  for (let i = 0; i < tenders.length; i += BATCH) batches.push(tenders.slice(i, i + BATCH));
  const results = await Promise.all(batches.map((b) => scoreBatch(profile, b)));
  return results.flat();
}
