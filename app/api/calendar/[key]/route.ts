import { calendarKey, sameText } from "@/lib/session";
import { getMarkedTenders, getState } from "@/lib/store";
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
  if (!sameText(key.replace(/\.ics$/, ""), await calendarKey(process.env.APP_PASSWORD))) {
    return new Response("Neplatný odkaz", { status: 404 });
  }
  const state = await getState();
  const statuses = (state.db ? state.statuses : {}) as Record<string, Status>;
  const tenders = (await getMarkedTenders()).filter((t) => LABEL[statuses[t.id]] && t.deadline);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

  const events = tenders.flatMap((t) => {
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
