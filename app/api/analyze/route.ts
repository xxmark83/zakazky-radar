import { pickModel } from "@/lib/ai";
import { analyzeTender, draftOffer } from "@/lib/analyze";
import { toDocs } from "@/lib/docs";
import { addSpend, setKept } from "@/lib/store";
import type { Analysis, Tender } from "@/lib/types";

export const maxDuration = 300; // stažení dokumentace a jejich přečtení může trvat i minuty

// AI rozbor zakázky nebo návrh nabídky – spouští se až tlačítkem v detailu, aby se zbytečně neplatil kredit
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Chybí ANTHROPIC_API_KEY." }, { status: 400 });
  }
  const body = (await req.json()) as {
    kind?: "analysis" | "draft";
    profile: string;
    tender: Tender;
    analysis?: Analysis | null;
    model?: string;
    uploads?: { name: string; data: string }[]; // ručně nahraná dokumentace (base64), když ji nenajdeme sami
  };
  const model = pickModel(body.model);
  try {
    const r =
      body.kind === "draft"
        ? await draftOffer(body.profile, body.tender, body.analysis ?? null, model)
        : await analyzeTender(
            body.profile,
            body.tender,
            model,
            (body.uploads ?? []).flatMap((u) => toDocs(u.name, "nahráno ručně", Buffer.from(u.data, "base64"))),
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
