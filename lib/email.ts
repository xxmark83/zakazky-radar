import type { Change, ScoredTender } from "./types";

const FIELD: Record<Change["field"], string> = { deadline: "lhůta", title: "název", value: "hodnota", description: "popis" };

// E-mail přes Resend (free tier 3 000 e-mailů/měsíc). Bez vlastní domény lze posílat jen na e-mail účtu Resend.
export async function sendAlert(
  groups: { profile: string; tenders: ScoredTender[] }[],
  appUrl: string,
  extra: { changed: { tender: ScoredTender; changes: Change[] }[]; deadlines: ScoredTender[] } = { changed: [], deadlines: [] },
) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!key || !to) throw new Error("Chybí RESEND_API_KEY nebo ALERT_EMAIL");

  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const money = (t: ScoredTender) => (t.value ? `${Math.round(t.value).toLocaleString("cs-CZ")} ${t.currency ?? ""}` : "hodnota neuvedena");
  const count = groups.reduce((n, g) => n + g.tenders.length, 0);

  const box = "border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px";
  const daysLeft = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000);
  const deadlinesHtml = extra.deadlines.length
    ? `<h3 style="margin:20px 0 8px;color:#e5484d">Blíží se lhůta</h3>${extra.deadlines
        .map(
          (t) => `<div style="${box}"><a href="${esc(t.url)}" style="font-weight:600;color:#16181d">${esc(t.title)}</a>
<div style="color:#666;font-size:13px">${esc(t.buyer)} · lhůta ${t.deadline} (za ${daysLeft(t.deadline!)} dní)</div></div>`,
        )
        .join("")}`
    : "";
  const changesHtml = extra.changed.length
    ? `<h3 style="margin:20px 0 8px">Změny u sledovaných zakázek</h3>${extra.changed
        .map(
          (c) => `<div style="${box}"><a href="${esc(c.tender.url)}" style="font-weight:600;color:#16181d">${esc(c.tender.title)}</a>
${c.changes.map((ch) => `<div style="font-size:14px">${FIELD[ch.field]}: <s>${esc(ch.from || "–")}</s> → <b>${esc(ch.to)}</b></div>`).join("")}</div>`,
        )
        .join("")}`
    : "";
  const parts = [
    count ? `${count} nových zakázek` : "",
    extra.deadlines.length ? `${extra.deadlines.length}× blížící se lhůta` : "",
    extra.changed.length ? `${extra.changed.length}× změna` : "",
  ].filter(Boolean);

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px">
<h2 style="margin:0 0 4px">Zakázky radar: ${parts.join(", ")}</h2>
<p style="color:#666;margin:0 0 16px"><a href="${esc(appUrl)}">Otevřít aplikaci</a></p>
${deadlinesHtml}${changesHtml}
${groups
  .map(
    (g) => `<h3 style="margin:20px 0 8px">${esc(g.profile)}</h3>
${g.tenders
  .map(
    (t) => `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px">
<b style="background:${t.score >= 75 ? "#0f9d58" : "#e8a400"};color:#fff;border-radius:6px;padding:1px 7px">${t.score}</b>
${t.kind === "upcoming" ? '<span style="color:#1f5eff"> připravovaná</span>' : ""}
<a href="${esc(t.url)}" style="font-weight:600;color:#16181d"> ${esc(t.title)}</a>
<div style="color:#666;font-size:13px">${esc(t.buyer)} · ${money(t)} · lhůta ${t.deadline ?? "?"}</div>
<div style="font-size:14px;margin-top:4px">${esc(t.reason)}</div></div>`,
  )
  .join("")}`,
  )
  .join("")}</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.ALERT_FROM ?? "Zakázky radar <onboarding@resend.dev>",
      to: [to],
      subject: `Zakázky radar: ${parts.join(", ")}`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
