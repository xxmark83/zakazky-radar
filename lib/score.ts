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

const SYSTEM = `Jsi zkušený bid manažer pro české (a slovenské) veřejné zakázky. Dostaneš popis nabídky dodavatele (malá firma s levnými SaaS aplikacemi) a seznam zakázek.
Ke každé zakázce vrať:
- score 0–100: jak reálně by dodavatel mohl zakázku vyhrát nebo se na ní podílet (jako hlavní dodavatel či subdodavatel). 80+ = přesně sedí, 50–79 = část plnění sedí, pod 30 = nesouvisí.
  Snižuj skóre, pokud zakázka vyžaduje rozsah, reference nebo obrat, který malá firma nesplní, nebo jde hlavně o hardware/stavbu.
- product: který produkt/služba dodavatele sedí (krátce), nebo "–".
- reason: jedna věta česky, proč.
- region: kraj, kde sídlí zadavatel (podle názvu obce, města nebo instituce). Ministerstva a celostátní úřady = "celostátní", slovenský zadavatel = "Slovensko", když nevíš = "neznámý".
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
    // AI některou zakázku vynechala: skóre -1 = nehodnoceno. Neukládá se, příští hledání ji pošle znovu
    // (dřív dostala natrvalo 0 a už se nikdy neukázala).
    if (!r) return { ...t, score: -1, product: "–", reason: "" };
    return {
      ...t,
      score: Math.max(0, Math.min(100, r.score)),
      product: r.product ?? "–",
      reason: r.reason ?? "",
      region: r.region ?? "neznámý",
    };
  });
  return { tenders, cost };
}

const PARALLEL = 4; // dávek najednou – víc naráz naráží na limit počtu dotazů API

export async function scoreTenders(profile: string, tenders: Tender[], model: ModelChoice, onBatch?: (done: number, all: number) => void) {
  const batches: Tender[][] = [];
  for (let i = 0; i < tenders.length; i += BATCH) batches.push(tenders.slice(i, i + BATCH));
  let done = 0;
  let next = 0;
  let cost = 0;
  let failed = 0; // zakázky z dávek, které selhaly – zůstanou nehodnocené, hledání kvůli nim nespadne
  let error = "";
  const out: ScoredTender[][] = [];
  const worker = async () => {
    while (next < batches.length) {
      const i = next++;
      try {
        const r = await scoreBatch(profile, batches[i], model);
        out[i] = r.tenders;
        cost += r.cost;
      } catch (e: any) {
        out[i] = batches[i].map((t) => ({ ...t, score: -1, product: "–", reason: "" }));
        failed += batches[i].length;
        error = String(e?.message ?? e);
      }
      onBatch?.(++done, batches.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, worker));
  const all = out.flat();
  return { tenders: all, cost, failed, error, skipped: all.filter((t) => t.score < 0).length - failed };
}
