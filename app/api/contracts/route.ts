import { accessFor, allowedPresets } from "@/lib/access";
import { addSubjects, checkContracts, lookupSubjects, getFeed, getWatched, passes, updateWatched, type Watched } from "@/lib/contracts";
import { redis } from "@/lib/store";

export const maxDuration = 60;

// Smlouvy sledovaných subjektů (Registr smluv přes Hlídač státu)
export async function GET(req: Request) {
  // „Zkontrolovat teď“ – jinak se kontroluje každé ráno
  if (new URL(req.url).searchParams.get("check")) await checkContracts();
  const watched = await getWatched();
  const byIco = new Map(watched.map((w) => [w.ico, w]));
  return Response.json({
    db: Boolean(redis),
    hlidac: Boolean(process.env.HLIDAC_TOKEN),
    areas: allowedPresets(await accessFor()).map((p) => p.name),
    all: !(await accessFor()).presets, // smí vybrat „vše“
    watched,
    // přehled jen pro subjekty, které pořád sledujeme, a podle jejich aktuálního filtru
    feed: (await getFeed()).filter((c) => byIco.has(c.ico) && passes(byIco.get(c.ico)!, c)).slice(0, 150),
  });
}

export async function POST(req: Request) {
  if (!redis) return Response.json({ error: "Sledování potřebuje databázi (Upstash)." }, { status: 400 });
  const body = (await req.json()) as {
    lookup?: string;
    subjects?: { ico: string; name: string }[];
    ico?: string;
    filter?: Watched["filter"];
    remove?: boolean;
  };
  // krok 1: vyhledat v ARES, nic neukládat
  if (body.lookup) return Response.json(await lookupSubjects(body.lookup));
  // krok 2: sledovat vybrané
  if (body.subjects) {
    const r = await addSubjects(body.subjects);
    if (r.added.length) await checkContracts();
    return Response.json(r);
  }
  if (body.ico) return Response.json({ watched: await updateWatched(body.ico, { filter: body.filter, remove: body.remove }) });
  return Response.json({ error: "Nic k provedení." }, { status: 400 });
}
