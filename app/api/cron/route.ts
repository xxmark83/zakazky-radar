import { sendAlert } from "@/lib/email";
import { sendPush } from "@/lib/push";
import { buyerTenders } from "@/lib/watch";
import { PRESETS } from "@/lib/presets";
import { runSearch } from "@/lib/search";
import { filterUnseen, getBuyers, getKept, getMarkedTenders, getProfiles, getState, markSeen, redis, setKept, setStatus } from "@/lib/store";
import { changesFromProfily } from "@/lib/track";
import type { Change, ScoredTender, Status, WatchedProfile } from "@/lib/types";

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

  // sledované zakázky: změny podle dnešních dat z profilů a blížící se lhůty (jen s databází)
  const changed: { tender: ScoredTender; changes: Change[] }[] = [];
  const deadlines: ScoredTender[] = [];
  if (redis) {
    const state = await getState();
    const statuses = (state.db ? state.statuses : {}) as Record<string, Status>;
    const active = (await getMarkedTenders()).filter((t) => ["maybe", "bid", "sent"].includes(statuses[t.id]));
    const kept = await getKept();
    for (const f of changesFromProfily(active)) {
      changed.push(f);
      await setStatus(f.tender, statuses[f.tender.id]);
      await setKept("changes", f.tender.id, [...(kept?.changes[f.tender.id] ?? []), ...f.changes]);
    }
    const day = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
    deadlines.push(
      ...active
        .filter((t) => ["maybe", "bid"].includes(statuses[t.id]) && t.deadline)
        .filter((t) => (t.deadline! >= day(0) && t.deadline! <= day(3)) || t.deadline === day(7))
        .sort((a, b) => a.deadline!.localeCompare(b.deadline!)),
    );
    log.push(`sledované: ${active.length}, změny: ${changed.length}, blížící se lhůty: ${deadlines.length}`);
  }

  // sledovaní zadavatelé: cokoli nového od nich, i mimo klíčová slova
  const buyerNews: { buyer: string; tenders: ScoredTender[] }[] = [];
  if (redis) {
    const fresh = await buyerTenders(await getBuyers());
    const unseen = await filterUnseen(fresh.map((t) => t.id));
    for (const g of groups) for (const t of g.tenders) unseen.delete(t.id); // už je v e-mailu mezi novými
    for (const t of fresh.filter((x) => unseen.has(x.id))) {
      const g = buyerNews.find((x) => x.buyer === t.buyer);
      if (g) g.tenders.push(t);
      else buyerNews.push({ buyer: t.buyer, tenders: [t] });
    }
    log.push(`sledovaní zadavatelé: ${buyerNews.reduce((n, g) => n + g.tenders.length, 0)} nových`);
  }

  // upozornění na telefon: shrnutí nových, každá blížící se lhůta, každý sledovaný zadavatel
  if (redis) {
    const count = groups.reduce((n, g) => n + g.tenders.length, 0);
    const best = groups.flatMap((g) => g.tenders).sort((a, b) => b.score - a.score)[0];
    let pushed = 0;
    if (count)
      pushed += await sendPush({
        title: `${count} ${count === 1 ? "nová zakázka" : count < 5 ? "nové zakázky" : "nových zakázek"}`,
        body: best ? `${best.score} – ${best.title}` : "",
        url: "/",
        tag: "nove",
      });
    for (const t of deadlines.filter((x) => x.deadline! <= new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10)))
      pushed += await sendPush({ title: "Blíží se lhůta", body: `${t.deadline!.split("-").reverse().join(". ")} – ${t.title}`, url: "/", tag: `lhuta-${t.id}` });
    for (const g of buyerNews)
      pushed += await sendPush({ title: g.buyer, body: `Nová zakázka: ${g.tenders[0].title}`, url: "/", tag: `zadavatel-${g.buyer}` });
    log.push(`upozornění na telefon: ${pushed}`);
  }

  if (groups.length || changed.length || deadlines.length || buyerNews.length) {
    const appUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : new URL(req.url).origin;
    try {
      await sendAlert(groups, appUrl, { changed, deadlines, buyers: buyerNews });
      await markSeen([...groups, ...buyerNews].flatMap((g) => g.tenders.map((t) => t.id)));
      log.push("e-mail odeslán");
    } catch (e: any) {
      log.push(`e-mail selhal: ${e.message}`);
    }
  }
  return Response.json({ ok: true, log });
}
