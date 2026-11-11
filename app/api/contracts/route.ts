import { accessFor, allowedPresets } from "@/lib/access";
import { addSubjects, checkContracts, lookupSubjects, getDays, getFeed, getSource, getWatched, passes, PERIODS, setDays, sinceDay, updateWatched, type Watched } from "@/lib/contracts";
import { redis } from "@/lib/store";

export const maxDuration = 60;

// Smlouvy sledovaných subjektů (Registr smluv přes Hlídač státu)
export async function GET(req: Request) {
  // „Zkontrolovat teď“ – jinak se kontroluje každé ráno
  if (new URL(req.url).searchParams.get("check")) await checkContracts();
  const watched = await getWatched();
  const byIco = new Map(watched.map((w) => [w.ico, w]));
  const days = await getDays();
  const since = sinceDay(days);
  return Response.json({
    days,
    periods: PERIODS,
    ...(await getSource()), // source: odkud smlouvy jsou (hlidac = celý registr, local = jen IT z vlastních dat)
    db: Boolean(redis),
    hlidac: Boolean(process.env.HLIDAC_TOKEN),
    areas: allowedPresets(await accessFor()).map((p) => p.name),
    all: !(await accessFor()).presets, // smí vybrat „vše“
    watched,
    // přehled jen pro subjekty, které pořád sledujeme, a podle jejich aktuálního filtru
    // a jen ze zvoleného období (podle data podpisu)
    feed: (await getFeed()).filter((c) => byIco.has(c.ico) && passes(byIco.get(c.ico)!, c) && (!c.signed || c.signed >= since)).slice(0, 600),
  });
}

export async function POST(req: Request) {
  if (!redis) return Response.json({ error: "Sledování potřebuje databázi (Upstash)." }, { status: 400 });
  const body = (await req.json()) as {
    lookup?: string;
    subjects?: { ico: string; name: string }[];
    ico?: string;
    name?: string;
    filter?: Watched["filter"];
    remove?: boolean;
    days?: number;
  };
  // krok 1: vyhledat v ARES, nic neukládat
  if (body.lookup) return Response.json(await lookupSubjects(body.lookup));
  // krok 2: sledovat vybrané
  if (body.subjects) {
    const r = await addSubjects(body.subjects);
    if (r.added.length) await checkContracts();
    return Response.json(r);
  }
  // změna období: uložit a rovnou dohledat starší smlouvy. Uloží se do přehledu, takže ráno nepřijdou jako „nové“.
  if (body.days) {
    if (!PERIODS.includes(body.days)) return Response.json({ error: "Neznámé období." }, { status: 400 });
    await setDays(body.days);
    await checkContracts();
    return Response.json({ days: body.days });
  }
  // subjekt bez IČO (starší záznam) se pozná podle názvu
  if (body.ico || ((body.remove || body.filter) && body.name))
    return Response.json({ watched: await updateWatched(body.ico ?? "", { filter: body.filter, remove: body.remove, name: body.name }) });
  return Response.json({ error: "Nic k provedení." }, { status: 400 });
}
