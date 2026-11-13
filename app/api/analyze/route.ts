import { pickModel } from "@/lib/ai";
import { analyzeTender, draftOffer } from "@/lib/analyze";
import { getReferences } from "@/lib/company";
import { addSpend, setKept } from "@/lib/store";
import type { Analysis, Tender } from "@/lib/types";
import { aiBudgetLeft, BUDGET_ERROR } from "@/lib/budget";

export const maxDuration = 300; // stažení dokumentace a jejich přečtení může trvat i minuty

// AI rozbor zakázky nebo návrh nabídky – spouští se až tlačítkem v detailu, aby se zbytečně neplatil kredit
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Chybí ANTHROPIC_API_KEY." }, { status: 400 });
  }
  if (!(await aiBudgetLeft())) return Response.json({ error: BUDGET_ERROR }, { status: 402 });
  const body = (await req.json()) as {
    kind?: "analysis" | "draft";
    profile: string;
    tender: Tender;
    analysis?: Analysis | null;
    model?: string;
    texts?: { name: string; text: string }[]; // podklady nahrané v detailu (text vytažený v prohlížeči)
  };
  const model = pickModel(body.model);
  try {
    const r =
      body.kind === "draft"
        ? await draftOffer(body.profile, body.tender, body.analysis ?? null, model, await getReferences())
        : await analyzeTender(
            body.profile,
            body.tender,
            model,
            (body.texts ?? [])
              .slice(0, 40)
              .filter((d) => String(d.text).trim())
              .map((d) => ({ name: String(d.name).slice(0, 200), type: "nahráno", text: String(d.text).slice(0, 200_000) })),
          );
    await Promise.all([
      addSpend(r.cost),
      setKept(body.kind === "draft" ? "drafts" : "analysis", body.tender.id, r.data),
    ]).catch(() => {});
    return Response.json({ data: r.data, cost: r.cost });
  } catch (e: any) {
    return Response.json({ error: `AI selhala: ${e.message}` }, { status: 500 });
  }
}
