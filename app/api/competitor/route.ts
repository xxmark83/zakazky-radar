import { isvzByWinner, mergeAwards } from "@/lib/sources/isvz";
import { fetchTedByWinner } from "@/lib/sources/ted";

export const maxDuration = 60;

// Profil konkurenta: co vyhrál, u koho a za kolik (TED, posledních 5 let)
export async function POST(req: Request) {
  const { name, slovakia } = (await req.json()) as { name: string; slovakia?: boolean };
  try {
    const ted = await fetchTedByWinner(name, 1825, slovakia ? ["CZE", "SVK"] : ["CZE"]);
    const awards = mergeAwards(isvzByWinner(name), ted).sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
    const czk = awards.filter((a) => a.value && a.currency === "CZK");
    const buyers = new Map<string, number>();
    for (const a of awards) buyers.set(a.buyer, (buyers.get(a.buyer) ?? 0) + 1);
    const byYear = new Map<string, number>();
    for (const a of awards) if (a.published) byYear.set(a.published.slice(0, 4), (byYear.get(a.published.slice(0, 4)) ?? 0) + 1);
    return Response.json({
      name,
      count: awards.length,
      total: czk.reduce((s, a) => s + a.value! / Math.max(1, a.winners.length), 0),
      topBuyers: [...buyers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([buyer, wins]) => ({ buyer, wins })),
      byYear: [...byYear.entries()].sort().map(([year, wins]) => ({ year, wins })),
      awards: awards.slice(0, 50),
    });
  } catch (e: any) {
    return Response.json({ error: `Profil konkurenta selhal: ${e.message}` }, { status: 500 });
  }
}
