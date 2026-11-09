import { accessFor, allowedForm } from "@/lib/access";
import { calendarKey } from "@/lib/session";
import { currentUser, users } from "@/lib/users";
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
    calendar: state.db ? await calendarKey(await currentUser()) : null,
    user: (await currentUser()).name, // prázdné u jediného účtu
    multi: users().length > 1,
    owner: (await currentUser()).owner,
    access: await accessFor(),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.status) await setStatus(body.status.tender, body.status.value);
  // hlídat smí jen povolené oblasti (ranní běh z nich hledá a platí AI)
  if (body.profiles) {
    const access = await accessFor();
    await saveProfiles(body.profiles.filter((p: Parameters<typeof allowedForm>[1]) => allowedForm(access, p)));
  }
  if (body.kept) await setKept(body.kept.kind as Kept, body.kept.id, body.kept.value);
  if (body.ui) await saveUi(body.ui);
  return Response.json({ ok: true });
}
