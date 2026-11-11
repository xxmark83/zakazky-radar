import type { SignedContract } from "./contracts";
import type { Award, Change, ScoredTender } from "./types";
import { currentUser } from "./users";

const FIELD: Record<Change["field"], string> = { deadline: "lhůta", title: "název", value: "hodnota", description: "popis" };

// E-mail přes Resend (free tier 3 000 e-mailů/měsíc). Bez vlastní domény lze posílat jen na e-mail účtu Resend.
export async function sendAlert(
  groups: { profile: string; tenders: ScoredTender[] }[],
  appUrl: string,
  extra: {
    changed: { tender: ScoredTender; changes: Change[] }[];
    deadlines: ScoredTender[];
    buyers?: { buyer: string; tenders: ScoredTender[] }[];
    competitors?: { name: string; awards: Award[] }[];
    contracts?: SignedContract[];
    morning?: { tender: ScoredTender; verdict: string; reason: string }[];
  } = { changed: [], deadlines: [] },
) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const money = (t: ScoredTender) => (t.value ? `${Math.round(t.value).toLocaleString("cs-CZ")} ${t.currency ?? ""}` : "hodnota neuvedena");
  const count = groups.reduce((n, g) => n + g.tenders.length, 0);

  const box = "border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px";
  const daysLeft = (d: string) => Math.max(0, Math.round((Date.parse(d.slice(0, 10)) - Date.parse(new Date().toISOString().slice(0, 10))) / 86400_000));
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
  const buyers = extra.buyers ?? [];
  const buyersHtml = buyers.length
    ? `<h3 style="margin:20px 0 8px">Od sledovaných zadavatelů</h3>${buyers
        .flatMap((g) =>
          g.tenders.map(
            (t) => `<div style="${box}"><a href="${esc(t.url)}" style="font-weight:600;color:#16181d">${esc(t.title)}</a>
<div style="color:#666;font-size:13px">${esc(g.buyer)} · ${money(t)} · lhůta ${t.deadline ?? "?"}</div></div>`,
          ),
        )
        .join("")}`
    : "";
  const competitors = extra.competitors ?? [];
  const competitorsHtml = competitors.length
    ? `<h3 style="margin:20px 0 8px">Sledovaní konkurenti</h3>${competitors
        .flatMap((c) =>
          c.awards.map(
            (a) => `<div style="${box}"><b>${esc(c.name)}</b> – <a href="${esc(a.url)}" style="color:#16181d">${esc(a.title)}</a>
<div style="color:#666;font-size:13px">${esc(a.buyer)} · ${a.value ? `${Math.round(a.value).toLocaleString("cs-CZ")} ${a.currency ?? ""}` : "cena neuvedena"} · ${a.published ?? ""}</div></div>`,
          ),
        )
        .join("")}`
    : "";
  // ranní AI rozbor nejlepších: verdikt hned u zakázky
  const verdicts = new Map((extra.morning ?? []).map((m) => [m.tender.id, m]));
  const VERDICT: Record<string, string> = { go: "✅ Podat", consider: "🤔 Zvážit", skip: "⛔ Nechat být" };
  const contracts = extra.contracts ?? [];
  const contractsHtml = contracts.length
    ? `<h3 style="margin:20px 0 8px">Nové smlouvy sledovaných subjektů</h3>${contracts
        .map(
          (c) => `<div style="${box}"><b>${esc(c.subject)}</b> (${c.role}) – <a href="${esc(c.url)}" style="color:#16181d">${esc(c.title)}</a>
<div style="color:#666;font-size:13px">${esc(c.counterpart || "–")} · ${c.value ? `${c.value.toLocaleString("cs-CZ")} Kč bez DPH` : "cena neuvedena"} · podepsáno ${c.signed ?? "?"}</div></div>`,
        )
        .join("")}`
    : "";
  const parts = [
    count ? `${count} nových zakázek` : "",
    extra.deadlines.length ? `${extra.deadlines.length}× blížící se lhůta` : "",
    extra.changed.length ? `${extra.changed.length}× změna` : "",
    buyers.length ? `${buyers.reduce((n, g) => n + g.tenders.length, 0)}× od sledovaných zadavatelů` : "",
    competitors.length ? `${competitors.reduce((n, c) => n + c.awards.length, 0)}× konkurence` : "",
    contracts.length ? `${contracts.length}× nová smlouva` : "",
  ].filter(Boolean);

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px">
<h2 style="margin:0 0 4px">Zakázky radar: ${parts.join(", ")}</h2>
<p style="color:#666;margin:0 0 16px"><a href="${esc(appUrl)}">Otevřít aplikaci</a></p>
${deadlinesHtml}${changesHtml}${buyersHtml}${competitorsHtml}${contractsHtml}
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
<div style="font-size:14px;margin-top:4px">${esc(t.reason)}</div>${
      verdicts.has(t.id)
        ? `<div style="font-size:14px;margin-top:6px;padding:6px 8px;background:#f1f5ff;border-radius:6px"><b>AI rozbor: ${VERDICT[verdicts.get(t.id)!.verdict] ?? ""}</b> – ${esc(verdicts.get(t.id)!.reason)}</div>`
        : ""
    }</div>`,
  )
  .join("")}`,
  )
  .join("")}</div>`;

  await send(`Zakázky radar: ${parts.join(", ")}`, html);
}

// komu: e-mail přihlášeného uživatele (u vlastníka ALERT_EMAIL, u dalších třetí část v USERS)
async function send(subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  const to = (await currentUser()).email;
  if (!key) throw new Error("Chybí RESEND_API_KEY");
  if (!to) throw new Error("uživatel nemá e-mail (USERS jméno:heslo:e-mail)");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.ALERT_FROM ?? "Zakázky radar <onboarding@resend.dev>", to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export type Weekly = {
  counts: { maybe: number; bid: number; sent: number; won: number; lost: number };
  deadlines: ScoredTender[];
  results: { title: string; won: boolean; price: number | null; winner: string }[];
  buyers: number;
  competitorWins: number;
  spend: number | null;
};

/** Pondělní přehled týdne: rozpracované zakázky, lhůty na 14 dní, výsledky, sledovaní, útrata. */
export async function sendWeekly(w: Weekly, appUrl: string) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const tile = (v: string | number, l: string) =>
    `<td style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:10px"><div style="font-size:22px;font-weight:800">${v}</div><div style="color:#666;font-size:13px">${l}</div></td>`;
  const decided = w.counts.won + w.counts.lost;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:640px">
<h2 style="margin:0 0 4px">Týden v zakázkách</h2>
<p style="color:#666;margin:0 0 16px"><a href="${esc(appUrl)}">Otevřít aplikaci</a></p>
<table style="border-collapse:separate;border-spacing:6px;width:100%"><tr>
${tile(w.counts.maybe, "zvažuješ")}${tile(w.counts.bid, "připravuješ")}${tile(w.counts.sent, "podáno, čeká")}
</tr><tr>
${tile(decided ? `${Math.round((w.counts.won / decided) * 100)} %` : "–", `úspěšnost (${w.counts.won} z ${decided})`)}${tile(w.buyers, "zakázek od sledovaných zadavatelů")}${tile(w.competitorWins, "výher konkurence za týden")}
</tr></table>
<h3 style="margin:20px 0 8px">Lhůty v příštích 14 dnech</h3>
${
  w.deadlines.length
    ? w.deadlines
        .map(
          (t) =>
            `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 12px;margin-bottom:8px"><a href="${esc(t.url)}" style="font-weight:600;color:#16181d">${esc(t.title)}</a><div style="color:#666;font-size:13px">${esc(t.buyer)} · lhůta ${t.deadline}</div></div>`,
        )
        .join("")
    : '<p style="color:#666">Žádné.</p>'
}
${
  w.results.length
    ? `<h3 style="margin:20px 0 8px">Výsledky za týden</h3>${w.results
        .map((r) => `<div style="font-size:14px;margin-bottom:4px">${r.won ? "✅ Výhra" : "❌ Nevyšlo"} – ${esc(r.title)}${r.won ? "" : r.winner ? ` (vyhrál ${esc(r.winner)})` : ""}${r.price ? `, ${Math.round(r.price).toLocaleString("cs-CZ")} Kč` : ""}</div>`)
        .join("")}`
    : ""
}
${w.spend !== null ? `<p style="color:#666;font-size:13px;margin-top:20px">Útrata za AI tento měsíc: ${w.spend.toFixed(2)} $</p>` : ""}
</div>`;
  await send("Zakázky radar: týden v zakázkách", html);
}

/** Krátký textový e-mail (bezpečnostní upozornění). */
export async function sendPlain(subject: string, text: string) {
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  await send(subject, `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px"><h2 style="margin:0 0 8px">${esc(subject)}</h2><p>${esc(text)}</p><p style="color:#666;font-size:13px">Pokud jsi to nebyl ty, změň heslo a v Nastavení → Zabezpečení odhlas ostatní zařízení.</p></div>`);
}
