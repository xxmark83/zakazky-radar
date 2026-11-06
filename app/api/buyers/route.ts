import { findBuyer } from "@/lib/buyer";
import { getBuyers, redis, saveBuyers } from "@/lib/store";
import { buyerTenders } from "@/lib/watch";

export const maxDuration = 60;

// sledovaní zadavatelé a jejich otevřené zakázky
export async function GET() {
  const buyers = await getBuyers();
  return Response.json({ db: Boolean(redis), buyers, tenders: await buyerTenders(buyers) });
}

export async function POST(req: Request) {
  if (!redis) return Response.json({ error: "Sledování zadavatelů potřebuje databázi (Upstash)." }, { status: 400 });
  const body = (await req.json()) as { add?: string; remove?: string };
  let list = await getBuyers();
  if (body.add && !list.some((b) => b.name === body.add)) {
    const found = await findBuyer(body.add); // IČO kvůli Hlídači státu
    list = [...list, { name: body.add, ico: found.ico, added: new Date().toISOString().slice(0, 10) }];
  }
  if (body.remove) list = list.filter((b) => b.name !== body.remove);
  await saveBuyers(list);
  return Response.json({ buyers: list });
}
