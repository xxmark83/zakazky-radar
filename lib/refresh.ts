// „Stáhnout všechno znovu“ (jen správce): na GitHubu spustí plný sběr profilů zadavatelů a obnovu
// Registru smluv za poslední 3 měsíce a do repozitáře zapíše požadavek pro Mac (data/refresh-request.json),
// který při dalším běhu (každé 3 h) znovu projde Vhodné uveřejnění za 35 dní a ISVZ za poslední 3 měsíce.
// Potřebuje GH_DISPATCH_TOKEN ve Vercelu: fine-grained token jen pro repo zakazky-radar,
// oprávnění Actions: Read and write a Contents: Read and write.
const UA = "zakazky-radar (verejne zakazky, kontakt pres GitHub xxmark83)";
const REPO = "xxmark83/zakazky-radar";
const REQ = "data/refresh-request.json";
const DONE = "data/refresh-done.json";

export const refreshReady = () => Boolean(process.env.GH_DISPATCH_TOKEN);

async function gh(path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GH_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": UA,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
}

const ym = (d: Date) => d.toISOString().slice(0, 7);

export async function startRefresh(by: string) {
  const id = new Date().toISOString();
  const from = new Date();
  from.setUTCDate(1);
  from.setUTCMonth(from.getUTCMonth() - 2);
  const steps: { name: string; ok: boolean; error?: string }[] = [];
  const dispatch = async (name: string, file: string, inputs: Record<string, string | boolean>) => {
    const r = await gh(`/actions/workflows/${file}/dispatches`, { method: "POST", body: JSON.stringify({ ref: "main", inputs }) }).catch((e) => e);
    steps.push(r instanceof Response && r.status === 204 ? { name, ok: true } : { name, ok: false, error: r instanceof Response ? `GitHub ${r.status}` : String(r) });
  };
  await dispatch("Profily zadavatelů (plný sběr 120 dní)", "crawl.yml", { full: true });
  await dispatch("Registr smluv (poslední 3 měsíce)", "smlouvy.yml", { from: ym(from), to: ym(new Date()) });

  // požadavek pro Mac
  try {
    const cur = await gh(`/contents/${REQ}`);
    const sha = cur.ok ? ((await cur.json()) as { sha: string }).sha : undefined;
    const content = Buffer.from(JSON.stringify({ id, by }, null, 1) + "\n").toString("base64");
    const r = await gh(`/contents/${REQ}`, {
      method: "PUT",
      body: JSON.stringify({
        message: `Požadavek na nové stažení dat (${id.slice(0, 10)})`,
        content,
        sha,
        committer: { name: "xxmark83", email: "142055462+xxmark83@users.noreply.github.com" },
      }),
    });
    steps.push(r.ok ? { name: "Mac: Vhodné uveřejnění a ISVZ", ok: true } : { name: "Mac: Vhodné uveřejnění a ISVZ", ok: false, error: `GitHub ${r.status}` });
  } catch (e: any) {
    steps.push({ name: "Mac: Vhodné uveřejnění a ISVZ", ok: false, error: e.message });
  }
  return { id, steps };
}

// stav posledního požadavku (veřejné soubory v repozitáři, na 2 minuty v paměti)
let cache: { at: number; v: { request: { id: string } | null; done: { id: string; at: string } | null } } | null = null;
export async function refreshState() {
  if (cache && Date.now() - cache.at < 120_000) return cache.v;
  const raw = async (f: string) => {
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${REPO}/main/${f}?t=${Date.now()}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  };
  const [request, done] = await Promise.all([raw(REQ), raw(DONE)]);
  const v = { request, done };
  cache = { at: Date.now(), v };
  return v;
}
export const clearRefreshCache = () => (cache = null);
