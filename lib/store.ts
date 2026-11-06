import { Redis } from "@upstash/redis";
import type { Score, ScoredTender, Status, WatchedProfile } from "./types";

// Databáze: Upstash Redis (Vercel Marketplace, free tier). Bez ní appka běží jen s úložištěm prohlížeče.
// Integrace na Vercelu nastaví KV_REST_API_URL/TOKEN, ručně lze UPSTASH_REDIS_REST_URL/TOKEN.
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
export const redis = url && token ? new Redis({ url, token }) : null;

const K = {
  statuses: "zr:statuses", // hash id -> Status
  tenders: "zr:tenders", // hash id -> ScoredTender (uložené kvůli historii)
  profiles: "zr:profiles", // WatchedProfile[]
  ui: "zr:ui", // hash klíč -> hodnota: výsledky hledání, volby, filtry a vzhled, aby mobil i počítač ukazovaly totéž
  seen: "zr:seen", // set id už poslaných e-mailem
  scores: (key: string) => `zr:scores:${key}`, // hash id -> Score pro jeden profil
  spend: (month: string) => `zr:spend:${month}`, // útrata za AI v USD
};

// poznámky, AI rozbory a návrhy nabídek: hash id -> hodnota
export type Kept = "notes" | "analysis" | "drafts" | "changes";
const KEPT: Kept[] = ["notes", "analysis", "drafts", "changes"];

export async function getKept() {
  if (!redis) return null;
  const all = await Promise.all(KEPT.map((k) => redis!.hgetall<Record<string, unknown>>(`zr:${k}`)));
  return Object.fromEntries(KEPT.map((k, i) => [k, all[i] ?? {}])) as Record<Kept, Record<string, any>>;
}

export async function setKept(kind: Kept, id: string, value: unknown) {
  if (!redis || !KEPT.includes(kind)) return;
  if (value === null || value === "") await redis.hdel(`zr:${kind}`, id);
  else await redis.hset(`zr:${kind}`, { [id]: value });
}

export async function getScores(key: string, ids: string[]): Promise<Record<string, Score>> {
  if (!redis || !ids.length) return {};
  const out: Record<string, Score> = {};
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    const vals = await redis.hmget<Record<string, Score>>(K.scores(key), ...part);
    for (const [id, v] of Object.entries(vals ?? {})) if (v) out[id] = v;
  }
  return out;
}

export async function saveScores(key: string, scores: Record<string, Score>) {
  if (redis && Object.keys(scores).length) await redis.hset(K.scores(key), scores);
}

const month = () => new Date().toISOString().slice(0, 7);
export async function addSpend(usd: number) {
  if (redis && usd > 0) await redis.incrbyfloat(K.spend(month()), usd);
}
export async function getSpend(): Promise<number | null> {
  return redis ? Number((await redis.get<number>(K.spend(month()))) ?? 0) : null;
}

export async function getState() {
  if (!redis) return { db: false as const };
  const [statuses, profiles, ui] = await Promise.all([
    redis.hgetall<Record<string, Status>>(K.statuses),
    redis.get<WatchedProfile[]>(K.profiles),
    redis.hgetall<Record<string, unknown>>(K.ui),
  ]);
  return { db: true as const, statuses: statuses ?? {}, profiles: profiles ?? [], ui: ui ?? {} };
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

// jen známé klíče z prohlížeče, ať se do databáze nedá zapsat cokoli
export const UI_KEYS = ["zr-results", "zr-fresh", "zr-form", "zr-prefs", "zr-sort", "zr-region", "zr-value", "zr-theme"];

export async function saveUi(values: Record<string, unknown>) {
  const ok = Object.fromEntries(Object.entries(values).filter(([k]) => UI_KEYS.includes(k)));
  if (redis && Object.keys(ok).length) await redis.hset(K.ui, ok);
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
