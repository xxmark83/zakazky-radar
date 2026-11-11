import { parseCpv, splitList } from "@/lib/search";
import { isvzAwards, isvzInfo, mergeAwards } from "@/lib/sources/isvz";
import { smlouvyAwards, smlouvyInfo } from "@/lib/sources/smlouvy";
import { fetchTedAwards } from "@/lib/sources/ted";

export const maxDuration = 120;

// Průzkum trhu: kdo a za kolik vyhrál podobné zakázky.
export async function POST(req: Request) {
  const body = await req.json();
  const days = Math.min(Math.max(Number(body.days) || 730, 30), 1825);
  try {
    const cpv = parseCpv(body.cpv ?? "");
    const keywords = splitList(body.keywords ?? "");
    // české výsledky z ISVZ (i podlimitní), TED doplní nadlimitní a slovenské
    // s krajem jen ISVZ (TED ani Registr smluv kraj spolehlivě neuvádějí)
    const region = typeof body.region === "string" && body.region ? body.region : undefined;
    const ted = region ? [] : await fetchTedAwards({ cpv, keywords, days, countries: body.slovakia ? ["CZE", "SVK"] : ["CZE"] });
    // Registr smluv nemá CPV – bere se jen při hledání podle klíčových slov
    const awards = mergeAwards(isvzAwards({ cpv, keywords, days, region }), ted, region ? [] : smlouvyAwards({ keywords, days }));
    const withOffers = awards.filter((a) => typeof a.offers === "number" && a.offers > 0);

    const czk = awards.filter((a) => a.value && a.currency === "CZK").map((a) => a.value!).sort((a, b) => a - b);
    const q = (p: number) => (czk.length ? czk[Math.min(czk.length - 1, Math.floor(p * czk.length))] : null);

    const winners = new Map<string, { name: string; wins: number; total: number; priced: number }>();
    for (const a of awards) {
      for (const w of a.winners) {
        const key = w.toLowerCase().replace(/[\s,.]+/g, " ").trim();
        const cur = winners.get(key) ?? { name: w, wins: 0, total: 0, priced: 0 };
        cur.wins++;
        if (a.currency === "CZK" && a.value) {
          cur.total += a.value / a.winners.length;
          cur.priced++;
        }
        winners.set(key, cur);
      }
    }

    return Response.json({
      count: awards.length,
      isvz: isvzInfo(),
      smlouvy: smlouvyInfo(),
      offers: withOffers.length
        ? {
            avg: withOffers.reduce((s, a) => s + a.offers!, 0) / withOffers.length,
            single: withOffers.filter((a) => a.offers === 1).length / withOffers.length,
            count: withOffers.length,
          }
        : null,
      prices: { count: czk.length, p25: q(0.25), median: q(0.5), p75: q(0.75), min: czk[0] ?? null, max: czk.at(-1) ?? null },
      topWinners: [...winners.values()]
        .sort((a, b) => b.wins - a.wins || b.total - a.total)
        .slice(0, 15)
        .map(({ priced, ...w }) => ({ ...w, avg: priced ? w.total / priced : null })),
      region: region ?? null,
      awards: awards.sort((a, b) => (b.published ?? "").localeCompare(a.published ?? "")).slice(0, 100),
    });
  } catch (e: any) {
    return Response.json({ error: `Průzkum selhal: ${e.message}` }, { status: 500 });
  }
}
