import { pickModel } from "@/lib/ai";
import { assessTender } from "@/lib/assess";
import { getCompany, getReferences } from "@/lib/company";
import { addSpend, setKept } from "@/lib/store";
import type { Tender } from "@/lib/types";

export const maxDuration = 300;

// „Zvládneme to?“ – kvalifikace a realizace z nahraných podkladů (text vytažený v prohlížeči) nebo z nalezené dokumentace
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Chybí ANTHROPIC_API_KEY." }, { status: 400 });
  const body = (await req.json()) as { tender: Tender; profile: string; model?: string; texts?: { name: string; text: string }[] };
  const texts = (body.texts ?? []).slice(0, 40).map((d) => ({ name: String(d.name).slice(0, 200), text: String(d.text).slice(0, 200_000) }));
  try {
    const [company, references] = await Promise.all([getCompany(), getReferences()]);
    const r = await assessTender({ tender: body.tender, profile: body.profile, company, references, texts, model: pickModel(body.model) });
    await Promise.all([addSpend(r.cost), setKept("assess", body.tender.id, r.data)]).catch(() => {});
    return Response.json({ data: r.data, cost: r.cost });
  } catch (e: any) {
    return Response.json({ error: `AI selhala: ${e.message}` }, { status: 500 });
  }
}
