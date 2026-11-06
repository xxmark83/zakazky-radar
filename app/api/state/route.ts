import { profilyInfo } from "@/lib/sources/profily";
import { getKept, getMarkedTenders, getSpend, getState, saveProfiles, saveUi, setKept, setStatus, type Kept } from "@/lib/store";

export async function GET() {
  const state = await getState();
  const [marked, kept, spend] = state.db ? await Promise.all([getMarkedTenders(), getKept(), getSpend()]) : [[], null, null];
  return Response.json({
    ...state,
    marked,
    kept,
    spend,
    budget: Number(process.env.AI_BUDGET_USD) || 5,
    model: process.env.AI_MODEL === "opus" ? "opus" : "haiku",
    email: Boolean(process.env.RESEND_API_KEY && process.env.ALERT_EMAIL),
    cron: Boolean(process.env.CRON_SECRET),
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    profily: profilyInfo(),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.status) await setStatus(body.status.tender, body.status.value);
  if (body.profiles) await saveProfiles(body.profiles);
  if (body.kept) await setKept(body.kept.kind as Kept, body.kept.id, body.kept.value);
  if (body.ui) await saveUi(body.ui);
  return Response.json({ ok: true });
}
