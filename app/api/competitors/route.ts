import { getCompetitors, redis, saveCompetitors } from "@/lib/store";

// sledovaní konkurenti (upozornění na jejich výhry chodí ranním e-mailem a na telefon)
export async function GET() {
  return Response.json({ db: Boolean(redis), competitors: await getCompetitors() });
}

export async function POST(req: Request) {
  if (!redis) return Response.json({ error: "Sledování konkurentů potřebuje databázi (Upstash)." }, { status: 400 });
  const body = (await req.json()) as { add?: string; remove?: string };
  let list = await getCompetitors();
  if (body.add && !list.some((c) => c.name === body.add)) list = [...list, { name: body.add, added: new Date().toISOString().slice(0, 10) }];
  if (body.remove) list = list.filter((c) => c.name !== body.remove);
  await saveCompetitors(list);
  return Response.json({ competitors: list });
}
