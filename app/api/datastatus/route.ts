import { datasets, runningJobs } from "@/lib/datastatus";
import { sendPlain } from "@/lib/email";
import { redis } from "@/lib/store";
import { currentUser, userKey } from "@/lib/users";

// stav stažených dat + kam chodí e-maily a jak dopadl poslední ranní e-mail
export async function GET() {
  const me = await currentUser();
  const [running, last] = await Promise.all([
    runningJobs(),
    redis ? redis.get<{ at: string; log: string[] }>(await userKey("mailLog")) : null,
  ]);
  return Response.json({
    datasets: datasets(),
    running,
    mail: {
      to: me.email,
      from: process.env.ALERT_FROM ?? "Zakázky radar <onboarding@resend.dev>",
      testSender: !process.env.ALERT_FROM,
      ready: Boolean(process.env.RESEND_API_KEY && me.email),
      cron: Boolean(process.env.CRON_SECRET),
      last: last ?? null,
    },
  });
}

// zkušební e-mail na adresu účtu (nejvýš jednou za minutu)
export async function POST() {
  const me = await currentUser();
  if (!me.email) return Response.json({ error: "Účet nemá e-mail – doplň ho ve Vercelu za dvojtečku (OWNER_JMENO=otisk:e-mail) nebo do ALERT_EMAIL." }, { status: 400 });
  if (redis && !(await redis.set(await userKey("mailTest"), 1, { nx: true, ex: 60 }))) {
    return Response.json({ error: "Zkušební e-mail jde poslat jednou za minutu." }, { status: 429 });
  }
  try {
    await sendPlain("Zkušební e-mail ze Zakázky radaru", "Funguje to. Sem ti každé ráno chodí nové zakázky, blížící se lhůty a novinky od sledovaných zadavatelů.");
    return Response.json({ ok: true, to: me.email });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
