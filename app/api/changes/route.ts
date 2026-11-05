import { changesFromProfily } from "@/lib/track";
import type { ScoredTender } from "@/lib/types";

// Kontrola změn u sledovaných zakázek proti dnešním datům z profilů zadavatelů.
// Uložení změn a nové podoby zakázky dělá klient (stejně jako u stavů).
export async function POST(req: Request) {
  const { tenders } = (await req.json()) as { tenders: ScoredTender[] };
  return Response.json({ found: changesFromProfily(tenders ?? []) });
}
