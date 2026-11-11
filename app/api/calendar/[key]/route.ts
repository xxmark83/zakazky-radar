import { calendarKey, sameText } from "@/lib/session";
import { questionsDeadline } from "@/lib/bidmath";
import { getKept, getMarkedTenders, getState } from "@/lib/store";
import { currentUser, users, withUser, type User } from "@/lib/users";
import type { Status } from "@/lib/types";

// Kalendář lhůt k odběru (ICS): zakázky, které zvažuješ, připravuješ nebo jsi podal.
// Google Kalendář i Apple Kalendář si ho samy obnovují (Google zhruba jednou za půl dne).
const LABEL: Partial<Record<Status, string>> = { maybe: "zvažuji", bid: "připravuji", sent: "podáno" };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (d: string) => d.slice(0, 10).replace(/-/g, "");
// řádky ICS nejvýš 75 bajtů, pokračování začíná mezerou
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 74) {
      out.push(cur);
      cur = " ";
    }
    cur += ch;
  }
  return [...out, cur].join("\r\n");
}

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  // čí kalendář: klíč v adrese patří právě jednomu uživateli (bez přihlašování je jen vlastník)
  const candidates = users().length ? users() : [await currentUser()];
  let owner: User | null = null;
  for (const u of candidates) if (sameText(key.replace(/\.ics$/, ""), await calendarKey(u))) owner = u;
  if (!owner) return new Response("Neplatný odkaz", { status: 404 });
  return withUser(owner, () => ics());
}

async function ics() {
  const state = await getState();
  const statuses = (state.db ? state.statuses : {}) as Record<string, Status>;
  const tenders = (await getMarkedTenders()).filter((t) => LABEL[statuses[t.id]] && t.deadline);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const analysis = ((await getKept())?.analysis ?? {}) as Record<string, { questionsDeadline?: string }>;

  const events = tenders.flatMap((t) => {
    // poslední den na dotazy k zadávací dokumentaci (z AI rozboru, jinak odhad) – jen dokud se nabídka chystá
    const q = statuses[t.id] !== "sent" ? questionsDeadline(t.deadline, analysis[t.id]?.questionsDeadline) : null;
    const qEvent = q
      ? [
          "BEGIN:VEVENT",
          `UID:q-${t.id.replace(/[^a-zA-Z0-9-]/g, "")}@zakazky-radar`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${ymd(q.date)}`,
          `DTEND;VALUE=DATE:${ymd(new Date(new Date(q.date).getTime() + 86400_000).toISOString())}`,
          `SUMMARY:${esc(`Dotazy do${q.estimated ? " (odhad)" : ""}: ${t.title}`)}`,
          `DESCRIPTION:${esc(`Poslední den na žádost o vysvětlení zadávací dokumentace${q.estimated ? " – odhad, přesnou lhůtu najdeš v dokumentaci" : ""}.\n${t.url}`)}`,
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${esc(`Zítra končí lhůta na dotazy: ${t.title}`)}`,
          "TRIGGER:-P1D",
          "END:VALARM",
          "END:VEVENT",
        ]
      : [];
    const next = new Date(new Date(t.deadline!).getTime() + 86400_000).toISOString();
    return [
      "BEGIN:VEVENT",
      `UID:${t.id.replace(/[^a-zA-Z0-9-]/g, "")}@zakazky-radar`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(t.deadline!)}`,
      `DTEND;VALUE=DATE:${ymd(next)}`,
      `SUMMARY:${esc(`Lhůta: ${t.title}`)}`,
      `DESCRIPTION:${esc(`${t.buyer}\nStav: ${LABEL[statuses[t.id]]}\n${t.url}`)}`,
      `URL:${t.url}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(`Za 3 dny končí lhůta: ${t.title}`)}`,
      "TRIGGER:-P3D",
      "END:VALARM",
      "END:VEVENT",
      ...qEvent,
    ];
  });
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zakazky radar//CS",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Zakázky – lhůty",
    "X-PUBLISHED-TTL:PT3H",
    ...events,
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n");
  return new Response(ics + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" },
  });
}
