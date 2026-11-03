import { fetchHlidac } from "@/lib/sources/hlidac";
import { fetchTed } from "@/lib/sources/ted";
import { scoreTenders } from "@/lib/score";
import type { SearchRequest, Tender } from "@/lib/types";

export const maxDuration = 300;

const split = (s: string) =>
  s
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export async function POST(req: Request) {
  const body = (await req.json()) as SearchRequest;
  const days = Math.min(Math.max(Number(body.days) || 30, 1), 180);
  const cpv = body.cpv.split(/[\s,;]+/).filter((c) => /^\d{8}$/.test(c));
  const keywords = split(body.keywords);
  const warnings: string[] = [];

  const [ted, hs] = await Promise.allSettled([
    fetchTed({ cpv, days }),
    fetchHlidac({ keywords, days }),
  ]);
  const tenders: Tender[] = [];
  if (ted.status === "fulfilled") tenders.push(...ted.value);
  else warnings.push(`TED: ${ted.reason?.message ?? ted.reason}`);
  if (hs.status === "fulfilled") tenders.push(...hs.value);
  else warnings.push(`Hlídač státu: ${hs.reason?.message ?? hs.reason}`);
  if (!process.env.HLIDAC_TOKEN) warnings.push("Hlídač státu vypnutý (chybí HLIDAC_TOKEN) – podlimitní zakázky se nenačítají.");

  // zahodit zakázky s prošlou lhůtou
  const today = new Date().toISOString().slice(0, 10);
  const open = tenders.filter((t) => !t.deadline || t.deadline >= today);

  if (!process.env.ANTHROPIC_API_KEY) {
    warnings.push("Chybí ANTHROPIC_API_KEY – zobrazuji zakázky bez AI hodnocení.");
    return Response.json({
      total: tenders.length,
      open: open.length,
      warnings,
      results: open.map((t) => ({ ...t, score: -1, product: "–", reason: "" })),
    });
  }

  try {
    const scored = await scoreTenders(body.profile, open);
    const results = scored
      .filter((t) => t.score >= (body.minScore ?? 0))
      .sort((a, b) => b.score - a.score);
    return Response.json({ total: tenders.length, open: open.length, warnings, results });
  } catch (e: any) {
    return Response.json({ error: `AI hodnocení selhalo: ${e.message}`, warnings }, { status: 500 });
  }
}
