import { askJson, type ModelChoice } from "./ai";
import { REGIONS } from "./regions";
import type { ScoredTender, Tender } from "./types";

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
          region: { type: "string", enum: [...REGIONS] },
        },
        required: ["id", "score", "product", "reason", "region"],
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
- region: kraj, kde sídlí zadavatel (podle názvu obce, města nebo instituce). Ministerstva a celostátní úřady = "celostátní", když nevíš = "neznámý".
Vrať výsledek pro každé id ze vstupu.`;

type Row = { id: string; score: number; product: string; reason: string; region: string };

async function scoreBatch(profile: string, batch: Tender[], model: ModelChoice) {
  const items = batch.map((t) => ({
    id: t.id,
    nazev: t.title,
    zadavatel: t.buyer,
    hodnota: t.value ? `${Math.round(t.value).toLocaleString("cs-CZ")} ${t.currency ?? ""}` : "neuvedeno",
    cpv: t.cpv.slice(0, 6).join(", "),
    popis: t.description.slice(0, 800),
  }));
  const { data, cost } = await askJson<{ results: Row[] }>({
    model,
    system: SYSTEM,
    schema: SCHEMA,
    content: `MOJE NABÍDKA:\n${profile}\n\nZAKÁZKY (JSON):\n${JSON.stringify(items)}`,
  });
  const byId = new Map(data.results.map((r) => [r.id, r]));
  const tenders: ScoredTender[] = batch.map((t) => {
    const r = byId.get(t.id);
    return {
      ...t,
      score: r ? Math.max(0, Math.min(100, r.score)) : 0,
      product: r?.product ?? "–",
      reason: r?.reason ?? "AI nevrátila hodnocení",
      region: r?.region ?? "neznámý",
    };
  });
  return { tenders, cost };
}

export async function scoreTenders(profile: string, tenders: Tender[], model: ModelChoice) {
  const batches: Tender[][] = [];
  for (let i = 0; i < tenders.length; i += BATCH) batches.push(tenders.slice(i, i + BATCH));
  const results = await Promise.all(batches.map((b) => scoreBatch(profile, b, model)));
  return { tenders: results.flatMap((r) => r.tenders), cost: results.reduce((a, r) => a + r.cost, 0) };
}
