import { Redis } from "@upstash/redis";
import type { ScoredTender, Status, WatchedProfile } from "./types";

// Databáze: Upstash Redis (Vercel Marketplace, free tier). Bez ní appka běží jen s úložištěm prohlížeče.
// Integrace na Vercelu nastaví KV_REST_API_URL/TOKEN, ručně lze UPSTASH_REDIS_REST_URL/TOKEN.
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
export const redis = url && token ? new Redis({ url, token }) : null;

const K = {
  statuses: "zr:statuses", // hash id -> Status
  tenders: "zr:tenders", // hash id -> ScoredTender (uložené kvůli historii)
  profiles: "zr:profiles", // WatchedProfile[]
  last: "zr:last", // poslední výsledky hledání
  seen: "zr:seen", // set id už poslaných e-mailem
};

export async function getState() {
  if (!redis) return { db: false as const };
  const [statuses, profiles, last] = await Promise.all([
    redis.hgetall<Record<string, Status>>(K.statuses),
    redis.get<WatchedProfile[]>(K.profiles),
    redis.get<{ form: unknown; results: ScoredTender[] }>(K.last),
  ]);
  return { db: true as const, statuses: statuses ?? {}, profiles: profiles ?? [], last };
}

export async function setStatus(tender: ScoredTender, status: Status) {
  if (!redis) return;
  if (status === "new") {
    await redis.hdel(K.statuses, tender.id);
  } else {
    await redis.hset(K.statuses, { [tender.id]: status });
    await redis.hset(K.tenders, { [tender.id]: tender });
  }
}

export async function getMarkedTenders(): Promise<ScoredTender[]> {
  if (!redis) return [];
  const all = await redis.hgetall<Record<string, ScoredTender>>(K.tenders);
  return Object.values(all ?? {});
}

export async function saveProfiles(profiles: WatchedProfile[]) {
  if (redis) await redis.set(K.profiles, profiles);
}

export async function getProfiles(): Promise<WatchedProfile[]> {
  return redis ? ((await redis.get<WatchedProfile[]>(K.profiles)) ?? []) : [];
}

export async function saveLast(last: { form: unknown; results: ScoredTender[] }) {
  if (redis) await redis.set(K.last, last);
}

/** Vrátí jen id, která ještě nebyla poslána e-mailem. */
export async function filterUnseen(ids: string[]): Promise<Set<string>> {
  if (!redis || !ids.length) return new Set(ids);
  const flags = await redis.smismember(K.seen, ids);
  return new Set(ids.filter((_, i) => !flags[i]));
}

export async function markSeen(ids: string[]) {
  if (redis && ids.length) await redis.sadd(K.seen, ids[0], ...ids.slice(1));
}
