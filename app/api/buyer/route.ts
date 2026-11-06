import { pickModel } from "@/lib/ai";
import { buyerAi, buyerHistory } from "@/lib/buyer";
import { addSpend, setKept } from "@/lib/store";
import type { Contract, Tender } from "@/lib/types";

export const maxDuration = 60;

// Historie zadavatele: smlouvy a zakázky za 5 let (zdarma), na tlačítko i AI zhodnocení (placené)
export async function POST(req: Request) {
  const body = (await req.json()) as {
    kind?: "list" | "ai";
    tender: Tender;
    keywords?: string;
    profile?: string;
    items?: Contract[];
    model?: string;
  };
  try {
    if (body.kind === "ai") {
      if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Chybí ANTHROPIC_API_KEY." }, { status: 400 });
      const r = await buyerAi(body.profile ?? "", body.tender, body.items ?? [], pickModel(body.model));
      await Promise.all([addSpend(r.cost), setKept("history", body.tender.id, r.data)]).catch(() => {});
      return Response.json({ data: r.data, cost: r.cost });
    }
    return Response.json(await buyerHistory(body.tender, body.keywords ?? ""));
  } catch (e: any) {
    return Response.json({ error: `Historie zadavatele selhala: ${e.message}` }, { status: 500 });
  }
}
