import { analyzeTender } from "@/lib/analyze";
import type { Tender } from "@/lib/types";

export const maxDuration = 120;

// AI rozbor jedné zakázky – spouští se až tlačítkem v detailu, aby se zbytečně neplatil kredit
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Chybí ANTHROPIC_API_KEY." }, { status: 400 });
  }
  const body = (await req.json()) as { profile: string; tender: Tender };
  try {
    return Response.json(await analyzeTender(body.profile, body.tender));
  } catch (e: any) {
    return Response.json({ error: `Rozbor selhal: ${e.message}` }, { status: 500 });
  }
}
