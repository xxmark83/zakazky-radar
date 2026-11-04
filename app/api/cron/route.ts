import { sendAlert } from "@/lib/email";
import { PRESETS } from "@/lib/presets";
import { runSearch } from "@/lib/search";
import { filterUnseen, getProfiles, markSeen, redis } from "@/lib/store";
import type { ScoredTender, WatchedProfile } from "@/lib/types";

export const maxDuration = 300;

// Spouští Vercel Cron každé ráno (vercel.json). Vercel posílá Authorization: Bearer CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const defaultMin = Number(process.env.WATCH_MIN_SCORE) || 75;
  const saved = (await getProfiles()).filter((p) => p.watch);
  const profiles: WatchedProfile[] = saved.length
    ? saved
    : PRESETS.slice(0, 1).map((p) => ({ ...p, minScore: defaultMin, watch: true }));

  // s databází hlídáme delší okno a duplicity odfiltrujeme; bez ní jen poslední den
  const days = redis ? 3 : 1;
  const groups: { profile: string; tenders: ScoredTender[] }[] = [];
  const log: string[] = [];

  for (const p of profiles) {
    for (const mode of ["open", "upcoming"] as const) {
      try {
        const minScore = p.minScore || defaultMin;
        const r = await runSearch({ ...p, mode, days, minScore });
        // bez AI klíče mají zakázky skóre -1 – e-mailem posíláme jen ohodnocené
        const good = r.results.filter((t) => t.score >= minScore);
        const fresh = await filterUnseen(good.map((t) => t.id));
        const tenders = good.filter((t) => fresh.has(t.id));
        log.push(`${p.name}/${mode}: ${r.open} aktuálních, ${good.length} vhodných, ${tenders.length} nových`);
        if (tenders.length) {
          const g = groups.find((x) => x.profile === p.name);
          if (g) g.tenders.push(...tenders);
          else groups.push({ profile: p.name, tenders });
        }
      } catch (e: any) {
        log.push(`${p.name}/${mode}: chyba ${e.message}`);
      }
    }
  }

  if (groups.length) {
    const appUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : new URL(req.url).origin;
    try {
      await sendAlert(groups, appUrl);
      await markSeen(groups.flatMap((g) => g.tenders.map((t) => t.id)));
      log.push("e-mail odeslán");
    } catch (e: any) {
      log.push(`e-mail selhal: ${e.message}`);
    }
  }
  return Response.json({ ok: true, log });
}
