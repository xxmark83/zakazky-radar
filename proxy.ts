import { NextResponse, type NextRequest } from "next/server";

// Jednoduché heslo (Basic Auth), aby nikdo cizí nepálil kredit za AI.
export function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const auth = req.headers.get("authorization") ?? "";
  const [, encoded] = auth.split(" ");
  const pass = encoded ? atob(encoded).split(":").slice(1).join(":") : "";
  if (pass === password) return NextResponse.next();
  return new NextResponse("Přihlášení vyžadováno", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Zakazky radar"' },
  });
}
