import webpush, { type PushSubscription } from "web-push";
import { redis } from "./store";

// Upozornění na telefon (Web Push). Klíče VAPID si appka vytvoří sama při prvním použití a drží je
// v databázi, nikdo je nemusí nikam opisovat. Odběry (telefon, počítač) jsou v zr:push.
type Vapid = { publicKey: string; privateKey: string };

async function vapid(): Promise<Vapid | null> {
  if (!redis) return null;
  const saved = await redis.get<Vapid>("zr:vapid");
  if (saved) return saved;
  const keys = webpush.generateVAPIDKeys();
  // když dva požadavky vytvářejí klíče současně, vyhraje první
  await redis.set("zr:vapid", keys, { nx: true });
  return (await redis.get<Vapid>("zr:vapid")) ?? keys;
}

export async function publicKey() {
  return (await vapid())?.publicKey ?? null;
}

export async function subscribe(sub: PushSubscription) {
  if (redis) await redis.hset("zr:push", { [sub.endpoint]: sub });
}
export async function unsubscribe(endpoint: string) {
  if (redis) await redis.hdel("zr:push", endpoint);
}
export async function subscriptions() {
  return redis ? Object.values((await redis.hgetall<Record<string, PushSubscription>>("zr:push")) ?? {}) : [];
}

/** Pošle upozornění na všechna přihlášená zařízení. Zaniklé odběry (410/404) smaže. Vrací počet doručených. */
export async function sendPush(msg: { title: string; body: string; url?: string; tag?: string }) {
  const keys = await vapid();
  const subs = await subscriptions();
  if (!keys || !subs.length) return 0;
  const site = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  webpush.setVapidDetails(site ? `https://${site}` : "https://zakazky-radar.local", keys.publicKey, keys.privateKey);
  let ok = 0;
  await Promise.all(
    subs.map((s) =>
      webpush
        .sendNotification(s, JSON.stringify(msg), { TTL: 12 * 3600 })
        .then(() => ok++)
        .catch((e: { statusCode?: number }) => {
          if (e.statusCode === 404 || e.statusCode === 410) return unsubscribe(s.endpoint);
        }),
    ),
  );
  return ok;
}
