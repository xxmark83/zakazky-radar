import { requestSession } from "./session";
import { authEnabled } from "./users";

/** Citlivé kroky (vypnutí 2FA, odhlášení zařízení, správa účtů): do 10 minut od přihlášení nebo nového ověření. */
export async function needSudo(req: Request): Promise<Response | null> {
  if (!authEnabled()) return null; // bez přihlašování (lokální vývoj)
  const s = await requestSession(req);
  if (!s) return Response.json({ error: "Přihlášení vypršelo." }, { status: 401 });
  if ((s.info.sudo ?? 0) > Date.now()) return null;
  return Response.json({ error: "Pro tento krok se znovu ověř heslem.", reauth: true }, { status: 401 });
}
