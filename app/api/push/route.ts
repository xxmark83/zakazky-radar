import { publicKey, sendPush, subscribe, subscriptions, unsubscribe } from "@/lib/push";

// přihlášení zařízení k upozorněním a zkušební upozornění
export async function GET() {
  const key = await publicKey();
  if (!key) return Response.json({ error: "Upozornění potřebují databázi (Upstash)." }, { status: 400 });
  return Response.json({ publicKey: key, devices: (await subscriptions()).length });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.subscribe) await subscribe(body.subscribe);
  if (body.unsubscribe) await unsubscribe(body.unsubscribe);
  if (body.test) {
    const sent = await sendPush({ title: "Zakázky radar", body: "Upozornění fungují. Takhle ti dám vědět o nových zakázkách.", url: "/" });
    return Response.json({ sent });
  }
  return Response.json({ ok: true });
}
