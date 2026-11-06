import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, validSession } from "@/lib/session";

// Přihlášení heslem APP_PASSWORD, aby nikdo cizí nepálil kredit za AI. Bez hesla je appka otevřená (lokální vývoj).
// cron se ověřuje vlastním CRON_SECRET; manifest, ikony a service worker stahuje telefon bez přihlášení
const PUBLIC = [
  "/login", "/api/login", "/api/cron", "/icon.svg", "/manifest.webmanifest", "/sw.js",
  "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png",
];

export async function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  const path = req.nextUrl.pathname;
  if (!password || PUBLIC.includes(path) || path.startsWith("/_next/")) return NextResponse.next();
  if (await validSession(req.cookies.get(COOKIE)?.value, password)) return NextResponse.next();

  if (path.startsWith("/api/")) {
    return Response.json({ error: "Přihlášení vypršelo, obnov stránku a přihlas se znovu." }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  if (path !== "/") login.searchParams.set("next", path + req.nextUrl.search);
  return NextResponse.redirect(login);
}
