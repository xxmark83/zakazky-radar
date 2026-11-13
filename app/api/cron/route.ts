import { sendAlert, sendWeekly } from "@/lib/email";
import { assessTender } from "@/lib/assess";
import { getCompany, getReferences } from "@/lib/company";
import { questionsDeadline } from "@/lib/bidmath";
import { checkContracts, type SignedContract } from "@/lib/contracts";
import { sendPush } from "@/lib/push";
import { buyerTenders, competitorWins } from "@/lib/watch";
import { PRESETS, upgradeProfile } from "@/lib/presets";
import { runSearch } from "@/lib/search";
import { addSpend, filterUnseen, keepAlerted, getBuyers, getCompetitors, getKept, getSpend, getMarkedTenders, getProfiles, getState, markSeen, redis, setKept, setStatus } from "@/lib/store";
import { changesFromProfily } from "@/lib/track";
import type { Award, Change, Outcome, ScoredTender, Status, WatchedProfile } from "@/lib/types";
import { currentUser, userKey, users, withUser } from "@/lib/users";

export const maxDuration = 300;

// Spouští Vercel Cron každé ráno (vercel.json). Vercel posílá Authorization: Bearer CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // každý uživatel má svá hlídání, sledované, upozornění i e-mail – projdeme je po jednom
  const list = users().length ? users() : [await currentUser()];
  const log: string[] = [];
  const started = Date.now();
  for (const u of list) {
    const lines = await withUser(u, () => runFor(req, started));
    log.push(...lines.map((l) => (list.length > 1 ? `${u.name}: ${l}` : l)));
  }
  return Response.json({ ok: true, log });
}

async function runFor(req: Request, started: number): Promise<string[]> {
  const defaultMin = Number(process.env.WATCH_MIN_SCORE) || 75;
  // hlídání uložená se starými klíčovými slovy oblasti hledají s novými (ručně upravená se nemění)
  const saved = (await getProfiles()).filter((p) => p.watch).map(upgradeProfile);
  // bez vlastních hlídání dostane výchozí profil jen vlastník (ostatním by AI zbytečně pálila kredit)
  const profiles: WatchedProfile[] = saved.length
    ? saved
    : (await currentUser()).owner
      ? PRESETS.slice(0, 1).map((p) => ({ ...p, minScore: defaultMin, watch: true }))
      : [];

  // S databází hlídáme 30 dní zpět: část profilů se stahuje se zpožděním několika dní, takže zakázka,
  // o které se dozvíme pozdě, by z krátkého okna vypadla a upozornění by nikdy nepřišlo. Co už e-mailem
  // odešlo, si pamatujeme (filterUnseen), a AI skóre se berou z paměti – delší okno nestojí nic navíc.
  // Bez databáze jen poslední den.
  const days = redis ? 30 : 1;
  const groups: { profile: string; tenders: ScoredTender[] }[] = [];
  const log: string[] = [];
  const partial = new Set<string>(); // zdroje, které ráno vrátily jen část nebo selhaly

  for (const p of profiles) {
    for (const mode of ["open", "upcoming"] as const) {
      try {
        const minScore = p.minScore || defaultMin;
        // NEN naživo jen krátce, ať ranní běh stihne všechna hlídání (zakázky z NEN jsou i ve sběru profilů)
        const r = await runSearch({ ...p, mode, days, minScore, nenBudgetMs: 20_000 });
        // bez AI klíče mají zakázky skóre -1 – e-mailem posíláme jen ohodnocené
        const good = r.results.filter((t) => t.score >= minScore);
        const fresh = await filterUnseen(good.map((t) => t.id));
        const tenders = good.filter((t) => fresh.has(t.id));
        for (const s of r.sources) {
          if (s.error) partial.add(`${s.name}: selhal (${s.error.slice(0, 80)})`);
          // NEN má ráno záměrně jen 20 s – co nestihne, pokrývá noční sběr profilů; hlásíme to, ale ne jako chybu
          else if (s.partial) partial.add(`${s.name}: ${s.partial}`);
        }
        const noAi = r.warnings.find((w) => /limit za AI|bez AI hodnocení|AI hodnocení zčásti/.test(w));
        log.push(
          `${p.name}/${mode}: ${r.open} aktuálních, ${good.length} vhodných (skóre ${minScore}+), ${tenders.length} nových` +
            (good.length > tenders.length ? `, ${good.length - tenders.length} už dřív posláno` : "") +
            (noAi ? ` – ${noAi}` : ""),
        );
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
  const questionSoon: { t: ScoredTender; estimated: boolean }[] = [];
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
    // poslední den na dotazy za 2 dny (z rozboru, jinak odhad)
    const analyses = (kept?.analysis ?? {}) as Record<string, { questionsDeadline?: string }>;
    for (const t of active.filter((x) => ["maybe", "bid"].includes(statuses[x.id]))) {
      const q = questionsDeadline(t.deadline, analyses[t.id]?.questionsDeadline);
      if (q && q.date === day(2)) questionSoon.push({ t, estimated: q.estimated });
    }
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

  // sledovaní konkurenti: nové výhry a smlouvy (id s předponou, ať se nepletou se zakázkami)
  const competitorNews: { name: string; awards: Award[] }[] = [];
  if (redis) {
    const wins = await competitorWins(await getCompetitors());
    const unseen = await filterUnseen(wins.flatMap((c) => c.awards.map((a) => `c:${a.id}`)));
    for (const c of wins) {
      const fresh = c.awards.filter((a) => unseen.has(`c:${a.id}`));
      if (fresh.length) competitorNews.push({ name: c.name, awards: fresh });
    }
    log.push(`konkurenti: ${competitorNews.reduce((n, c) => n + c.awards.length, 0)} nových výher`);
  }

  // ranní posouzení nejlepších nových zakázek (zapíná se v Nastavení, počítá se do měsíčního limitu)
  const morning: { tender: ScoredTender; verdict: string; reason: string }[] = [];
  if (redis && process.env.ANTHROPIC_API_KEY) {
    const ui = ((await getState()) as { ui?: Record<string, any> }).ui ?? {};
    const prefs = ui["zr-prefs"] ?? {};
    const howMany = Math.min(3, Number(prefs.morning) || 0);
    const budget = Number(prefs.budget) || Number(process.env.AI_BUDGET_USD) || 5;
    if (howMany && ((await getSpend()) ?? 0) < budget) {
      const best = groups
        .flatMap((g) => g.tenders.map((t) => ({ t, profile: profiles.find((p) => p.name === g.profile)?.profile ?? "" })))
        .filter((x) => x.t.score >= 75)
        .sort((a, b) => b.t.score - a.t.score)
        .slice(0, howMany);
      // jedno čtení dokumentace na zakázku: posouzení (kvalifikace, cena, smlouva) i rozbor (co chtějí, co přiložit).
      // Na kartě je pak vidět stopka dřív, než zakázku otevřeš. Jen když na to ranní běh má čas (limit 300 s na všechno).
      if (best.length && Date.now() - started < 170_000) {
        const [company, references] = await Promise.all([getCompany(), getReferences()]);
        await Promise.all(
          best.map(({ t, profile }) =>
            assessTender({ tender: t, profile, company, references, texts: [], model: prefs.model === "opus" ? "opus" : "haiku" })
              .then(async (r) => {
                await addSpend(r.cost);
                await Promise.all([setKept("assess", t.id, r.data), setKept("analysis", t.id, r.analysis)]);
                const stop = r.data.qualification.filter((q) => q.status === "nesplněno").length;
                morning.push({
                  tender: t,
                  verdict: r.analysis.verdict,
                  reason: `${r.data.verdictReason}${stop ? ` (${stop}× nesplněný požadavek)` : ""}${r.data.price?.level === "ztráta" ? " Cenově nevychází." : ""}`,
                });
              })
              .catch((e) => void log.push(`ranní posouzení selhalo: ${e.message}`)),
          ),
        );
      }
      log.push(`ranní posouzení: ${morning.length}`);
    }
  }

  // smlouvy sledovaných subjektů v Registru smluv
  const contractNews: SignedContract[] = redis ? await checkContracts().catch(() => []) : [];
  if (redis) log.push(`smlouvy sledovaných subjektů: ${contractNews.length} nových`);

  // upozornění na telefon: shrnutí nových, každá blížící se lhůta, každý sledovaný zadavatel
  if (redis) {
    const count = groups.reduce((n, g) => n + g.tenders.length, 0);
    const best = groups.flatMap((g) => g.tenders).sort((a, b) => b.score - a.score)[0];
    let pushed = 0;
    // ťuknutí na upozornění otevře rovnou detail zakázky (/?z=id), ne jen úvodní stránku
    const link = (t: { id: string }) => `/?z=${encodeURIComponent(t.id)}`;
    await keepAlerted([...groups.flatMap((g) => g.tenders), ...buyerNews.flatMap((g) => g.tenders)]).catch(() => {});
    if (count)
      pushed += await sendPush({
        title: `${count} ${count === 1 ? "nová zakázka" : count < 5 ? "nové zakázky" : "nových zakázek"}`,
        body: best ? `${best.score} – ${best.title}` : "",
        url: best ? link(best) : "/",
        tag: "nove",
      });
    for (const t of deadlines.filter((x) => x.deadline! <= new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10)))
      pushed += await sendPush({ title: "Blíží se lhůta", body: `${t.deadline!.split("-").reverse().join(". ")} – ${t.title}`, url: link(t), tag: `lhuta-${t.id}` });
    for (const g of buyerNews)
      pushed += await sendPush({ title: g.buyer, body: `Nová zakázka: ${g.tenders[0].title}`, url: link(g.tenders[0]), tag: `zadavatel-${g.buyer}` });
    for (const [subject, list] of Object.entries(Object.groupBy(contractNews, (c) => c.subject)))
      pushed += await sendPush({
        title: `${subject}: ${list!.length === 1 ? "nová smlouva" : `${list!.length} nové smlouvy`}`,
        body: `${list![0].title}${list![0].value ? `, ${Math.round(list![0].value).toLocaleString("cs-CZ")} Kč` : ""}`,
        url: "/",
        tag: `smlouvy-${subject}`,
      });
    for (const { t, estimated } of questionSoon)
      pushed += await sendPush({
        title: "Za 2 dny končí lhůta na dotazy",
        body: `${t.title}${estimated ? " (odhad – ověř v dokumentaci)" : ""}`,
        url: link(t),
        tag: `dotazy-${t.id}`,
      });
    for (const c of competitorNews)
      pushed += await sendPush({ title: `Konkurent: ${c.name}`, body: `Vyhrál: ${c.awards[0].title}`, url: "/", tag: `konkurent-${c.name}` });
    log.push(`upozornění na telefon: ${pushed}`);
  }

  const appUrlEarly = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : new URL(req.url).origin;

  // v pondělí navíc přehled týdne
  if (redis && new Date().getUTCDay() === 1) {
    try {
      const state = await getState();
      const statuses = (state.db ? state.statuses : {}) as Record<string, Status>;
      const marked = await getMarkedTenders();
      const kept = await getKept();
      const count = (st: Status) => Object.values(statuses).filter((x) => x === st).length;
      const in14 = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const week = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
      const byId = new Map(marked.map((t) => [t.id, t]));
      await sendWeekly(
        {
          counts: { maybe: count("maybe"), bid: count("bid"), sent: count("sent"), won: count("won"), lost: count("lost") },
          deadlines: marked
            .filter((t) => ["maybe", "bid"].includes(statuses[t.id]) && t.deadline && t.deadline >= today && t.deadline <= in14)
            .sort((a, b) => a.deadline!.localeCompare(b.deadline!)),
          results: Object.entries((kept?.results ?? {}) as Record<string, Outcome>)
            .filter(([, r]) => r.date >= week)
            .map(([id, r]) => ({ title: byId.get(id)?.title ?? id, won: r.winner === "my", price: r.price, winner: r.winner })),
          buyers: (await buyerTenders(await getBuyers())).length,
          competitorWins: (await competitorWins(await getCompetitors(), 7)).reduce((n, c) => n + c.awards.length, 0),
          spend: await getSpend(),
        },
        appUrlEarly,
      );
      log.push("týdenní přehled odeslán");
    } catch (e: any) {
      log.push(`týdenní přehled selhal: ${e.message}`);
    }
  }

  if (groups.length || changed.length || deadlines.length || buyerNews.length || competitorNews.length || contractNews.length) {
    const appUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : new URL(req.url).origin;
    try {
      await sendAlert(groups, appUrl, {
        changed,
        deadlines,
        buyers: buyerNews,
        competitors: competitorNews,
        contracts: contractNews,
        morning,
      });
      await markSeen([
        ...[...groups, ...buyerNews].flatMap((g) => g.tenders.map((t) => t.id)),
        ...competitorNews.flatMap((c) => c.awards.map((a) => `c:${a.id}`)),
      ]);
      log.push("e-mail odeslán");
    } catch (e: any) {
      log.push(`e-mail selhal: ${e.message}`);
    }
  } else log.push("nic nového – e-mail se neposílal");
  // Co se ráno stalo, ať to appka ukáže v Nastavení: řádky běhu, které zakázky šly do e-mailu a které zdroje
  // byly neúplné. Posledních 14 běhů zůstává, aby šlo zpětně dohledat, proč zakázka přišla nebo nepřišla.
  if (redis) {
    const entry = {
      at: new Date().toISOString(),
      log: log.slice(-16),
      sent: groups.flatMap((g) => g.tenders.map((t) => ({ title: t.title.slice(0, 140), score: t.score, profile: g.profile }))).slice(0, 40),
      partial: [...partial].slice(0, 12),
    };
    try {
      const prev = (await redis.get<(typeof entry)[]>(await userKey("mailHistory"))) ?? [];
      await redis.set(await userKey("mailHistory"), [entry, ...prev].slice(0, 14));
      await redis.set(await userKey("mailLog"), entry);
    } catch {}
  }
  return log;
}
