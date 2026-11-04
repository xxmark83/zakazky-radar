import { profilyInfo } from "@/lib/sources/profily";
import { getMarkedTenders, getState, saveProfiles, setStatus } from "@/lib/store";

export async function GET() {
  const state = await getState();
  const marked = state.db ? await getMarkedTenders() : [];
  return Response.json({
    ...state,
    marked,
    email: Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL),
    cron: Boolean(process.env.CRON_SECRET),
    profily: profilyInfo(),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.status) await setStatus(body.status.tender, body.status.value);
  if (body.profiles) await saveProfiles(body.profiles);
  return Response.json({ ok: true });
}
