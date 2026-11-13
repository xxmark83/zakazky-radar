import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sessionDetails } from "@/lib/session";
import { authEnabled, USER_HEADER } from "@/lib/users";

// Přihlášení (lib/users.ts), aby nikdo cizí nepálil kredit za AI a každý viděl jen svá data.
// Bez USERS i APP_PASSWORD je appka otevřená (lokální vývoj) a patří vlastníkovi.
// cron se ověřuje vlastním CRON_SECRET; manifest, ikony a service worker stahuje telefon bez přihlášení
const PUBLIC = [
  "/login", "/api/login", "/api/cron", "/heslo", "/icon.svg", "/manifest.webmanifest", "/sw.js",
  "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png",
];

// účet, který musí nejdřív zapnout 2FA, smí jen sem (stránka mu ukáže nastavení)
const SETUP_ALLOWED = ["/", "/api/state", "/api/account", "/api/logout"];
const SETUP_HEADER = "x-zr-setup";

// hlavičky s uživatelem nastavuje jen proxy – co poslal prohlížeč, zahodíme
const pass = (req: NextRequest, user?: string, setup = false) => {
  const headers = new Headers(req.headers);
  headers.delete(USER_HEADER);
  headers.delete(SETUP_HEADER);
  if (user !== undefined) headers.set(USER_HEADER, encodeURIComponent(user));
  if (setup) headers.set(SETUP_HEADER, "1");
  return NextResponse.next({ request: { headers } });
};

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // Na produkci bez nastavených účtů appku neotvíráme (chybějící nebo smazaná proměnná by ji jinak zpřístupnila
  // komukoli jako vlastníkovi). Lokální vývoj a náhledy zůstávají otevřené.
  if (!authEnabled() && process.env.VERCEL_ENV === "production" && !path.startsWith("/_next/"))
    return new Response("Chyba konfigurace: nejsou nastavené účty (OWNER_* / USER_* / APP_PASSWORD). Appka je zamčená, dokud je ve Vercelu nedoplníš.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  // kalendář lhůt si stahuje kalendářová aplikace bez přihlášení, ověřuje se tajným klíčem v adrese
  if (!authEnabled() || PUBLIC.includes(path) || path.startsWith("/_next/") || path.startsWith("/api/calendar/"))
    return pass(req);
  const s = await sessionDetails(req.cookies.get(COOKIE)?.value);
  if (s) {
    if (!s.info.setup) return pass(req, s.user.name);
    if (SETUP_ALLOWED.includes(path)) return pass(req, s.user.name, true);
    return Response.json({ error: "Nejdřív zapni dvoufázové ověření.", setup2fa: true }, { status: 403 });
  }

  if (path.startsWith("/api/")) {
    return Response.json({ error: "Přihlášení vypršelo, obnov stránku a přihlas se znovu." }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  if (path !== "/") login.searchParams.set("next", path + req.nextUrl.search);
  return NextResponse.redirect(login);
}
