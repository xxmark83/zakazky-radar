import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sessionUser } from "@/lib/session";
import { authEnabled, USER_HEADER } from "@/lib/users";

// Přihlášení (lib/users.ts), aby nikdo cizí nepálil kredit za AI a každý viděl jen svá data.
// Bez USERS i APP_PASSWORD je appka otevřená (lokální vývoj) a patří vlastníkovi.
// cron se ověřuje vlastním CRON_SECRET; manifest, ikony a service worker stahuje telefon bez přihlášení
const PUBLIC = [
  "/login", "/api/login", "/api/cron", "/heslo", "/icon.svg", "/manifest.webmanifest", "/sw.js",
  "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png",
];

// hlavičku s uživatelem nastavuje jen proxy – co poslal prohlížeč, zahodíme
const pass = (req: NextRequest, user?: string) => {
  const headers = new Headers(req.headers);
  headers.delete(USER_HEADER);
  if (user !== undefined) headers.set(USER_HEADER, encodeURIComponent(user));
  return NextResponse.next({ request: { headers } });
};

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // kalendář lhůt si stahuje kalendářová aplikace bez přihlášení, ověřuje se tajným klíčem v adrese
  if (!authEnabled() || PUBLIC.includes(path) || path.startsWith("/_next/") || path.startsWith("/api/calendar/"))
    return pass(req);
  const user = await sessionUser(req.cookies.get(COOKIE)?.value);
  if (user) return pass(req, user.name);

  if (path.startsWith("/api/")) {
    return Response.json({ error: "Přihlášení vypršelo, obnov stránku a přihlas se znovu." }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  if (path !== "/") login.searchParams.set("next", path + req.nextUrl.search);
  return NextResponse.redirect(login);
}
