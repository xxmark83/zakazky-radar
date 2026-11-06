import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, validSession } from "@/lib/session";

// Přihlášení heslem APP_PASSWORD, aby nikdo cizí nepálil kredit za AI. Bez hesla je appka otevřená (lokální vývoj).
const PUBLIC = ["/login", "/api/login", "/api/cron", "/icon.svg"]; // cron se ověřuje vlastním CRON_SECRET

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
