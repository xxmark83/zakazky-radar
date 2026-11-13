import type { Company, Reference } from "./company";
import type { Assessment, PriceCheck, QualItem } from "./types";

// Posouzení zakázky – čísla se neodhadují, ale počítají. AI z dokumentace vytáhne, co zadavatel chce
// (druh požadavku, částku, počet, období, které reference obsahem sedí), a tady se to porovná s firemním
// profilem: obrat po letech, limit pojištění, hodnota a stáří referencí. Výsledek výpočtu má přednost před
// odhadem AI a u požadavku je vidět, z čeho vyšel.

const kc = (v: number) =>
  v >= 1_000_000 ? `${(Math.round(v / 10_000) / 100).toLocaleString("cs-CZ")} mil. Kč` : `${Math.round(v).toLocaleString("cs-CZ")} Kč`;

/** Poslední uzavřené účetní roky, nejnovější první (v listopadu 2026 → 2025, 2024, 2023). */
export const closedYears = (now: Date, n = 3) => Array.from({ length: n }, (_, i) => String(now.getFullYear() - 1 - i));

const certValid = (until: string, now: Date) => !until || until.slice(0, 7) >= now.toISOString().slice(0, 7);

/** Strukturované údaje profilu jako text pro AI. */
export function profileFacts(c: Company | null, now: Date): string {
  if (!c) return "";
  const lines: string[] = [];
  const years = closedYears(now).filter((y) => c.turnover?.[y]);
  if (years.length) lines.push(`Obrat (Kč bez DPH): ${years.map((y) => `${y}: ${kc(c.turnover![y]!)}`).join(", ")}`);
  if (c.insurance) lines.push(`Pojištění odpovědnosti: limit ${kc(c.insurance)}`);
  if (c.certs?.length)
    lines.push(
      `Certifikace a oprávnění: ${c.certs
        .map((x) => `${x.name}${x.until ? ` (platí do ${x.until}${certValid(x.until, now) ? "" : " – PROPADLÁ"})` : ""}`)
        .join("; ")}`,
    );
  if (c.team?.length)
    lines.push(`Tým: ${c.team.map((m) => `${m.role}${m.years ? `, praxe ${m.years} let` : ""}${m.note ? ` (${m.note})` : ""}`).join("; ")}`);
  return lines.join("\n");
}

// unsure = výpočet nevyšel jednoznačně: „splněno/doložit“ od AI se změní na „nejasné“
type Result = { status?: QualItem["status"]; unsure?: boolean; calc: string; names?: string[] };

function turnover(q: QualItem, c: Company | null, now: Date): Result | null {
  if (!q.amount) return null;
  const years = closedYears(now, Math.min(Math.max(q.years || 3, 1), 5));
  const have = years.map((y) => [y, c?.turnover?.[y] ?? null] as const);
  const filled = have.filter(([, v]) => v);
  if (!filled.length) return { status: "nejasné", calc: `Požadováno ${kc(q.amount)}, ale obrat nemáš v profilu vyplněný – doplň ho v Nastavení → Firma.` };
  const list = filled.map(([y, v]) => `${y}: ${kc(v!)}`).join(", ");
  const vals = filled.map(([, v]) => v!);
  const all = filled.length === years.length;
  const head = `Požadováno ${kc(q.amount)}; tvůj obrat ${list}`;
  if (all && Math.min(...vals) >= q.amount) return { status: "doložit", calc: `${head} → splňuješ v každém roce. Dolož výkazem nebo čestným prohlášením.` };
  if (all && vals.reduce((a, b) => a + b, 0) < q.amount)
    return { status: "nesplněno", calc: `${head} → nestačí ani součet za ${years.length} roky. Řešení: společná nabídka nebo prokázání jinou osobou (§ 83 ZZVZ).` };
  if (all && Math.max(...vals) < q.amount)
    return { unsure: true, calc: `${head} → v žádném roce nedosahuješ; splníš jen tehdy, když zadavatel počítá součet za více let (${kc(vals.reduce((a, b) => a + b, 0))}). Ověř přesné znění.` };
  if (Math.max(...vals) >= q.amount)
    return { unsure: true, calc: `${head} → dosahuješ jen v některých letech${all ? "" : " (ostatní roky nejsou v profilu)"}. Záleží, jestli zadavatel chce každý rok, nebo stačí jeden – ověř přesné znění.` };
  return { unsure: true, calc: `${head}${all ? "" : " (ostatní roky nejsou v profilu)"} → ve vyplněných letech nedosahuješ.` };
}

function insurance(q: QualItem, c: Company | null): Result | null {
  if (!q.amount) return null;
  if (!c?.insurance) return { status: "nejasné", calc: `Požadován limit ${kc(q.amount)}, ale pojištění nemáš v profilu vyplněné – doplň ho v Nastavení → Firma.` };
  if (c.insurance >= q.amount) return { status: "doložit", calc: `Požadován limit ${kc(q.amount)}; tvoje pojištění ${kc(c.insurance)} → stačí. Dolož pojistnou smlouvou nebo certifikátem.` };
  return { status: "nesplněno", calc: `Požadován limit ${kc(q.amount)}; tvoje pojištění ${kc(c.insurance)} → nestačí. Limit lze u pojišťovny navýšit, obvykle během dnů.` };
}

function references(q: QualItem, refs: Reference[], now: Date): Result | null {
  // prázdná knihovna není „nesplněno“: nevíme, jestli firma reference nemá, nebo je jen ještě nevyplnila
  if (!refs.length) return { status: "nejasné", calc: "V knihovně nemáš žádné reference – doplň je v Nastavení → Firma, bez nich požadavek nejde posoudit." };
  const need = Math.max(1, q.count || 1);
  const picked = [...new Set(q.refs ?? [])].map((n) => refs[n - 1]).filter(Boolean);
  if (!picked.length) return { calc: `Obsahem neodpovídá žádná z tvých ${refs.length} referencí (potřeba ${need}).` };
  const minYear = q.years ? now.getFullYear() - q.years : 0;
  const ok: Reference[] = [];
  const bad: string[] = [];
  const missing: string[] = []; // reference, u které chybí údaj – po doplnění může vyhovět
  for (const r of picked) {
    const year = Number(String(r.year).match(/\d{4}/)?.[0]) || 0;
    if (q.amount && r.value && r.value < q.amount) bad.push(`${r.title} – ${kc(r.value)} je pod požadovanými ${kc(q.amount)}`);
    else if (minYear && year && year < minYear) bad.push(`${r.title} – rok ${year} je starší než ${q.years} ${q.years === 1 ? "rok" : q.years! < 5 ? "roky" : "let"}`);
    else if (q.amount && !r.value) missing.push(`${r.title} – nemá vyplněnou cenu`);
    else if (minYear && !year) missing.push(`${r.title} – nemá vyplněný rok`);
    else ok.push(r);
  }
  const names = ok.map((r) => `${r.title} (${r.client}, ${r.year}${r.value ? `, ${kc(r.value)}` : ""})`);
  const limits = [q.amount ? `min. ${kc(q.amount)}` : "", q.years ? `za poslední ${q.years} ${q.years === 1 ? "rok" : q.years < 5 ? "roky" : "let"}` : ""].filter(Boolean).join(", ");
  const head = `Potřeba ${need}${limits ? ` (${limits})` : ""}; vyhovuje ${ok.length}`;
  const tail = (bad.length ? ` Nevyhovují: ${bad.join("; ")}.` : "") + (missing.length ? ` Chybí údaj: ${missing.join("; ")}.` : "");
  if (ok.length >= need) return { status: "splněno", calc: `${head}: ${names.join("; ")}.${tail}`, names: ok.map((r) => r.title) };
  // s doplněnými údaji by počet mohl stačit – verdikt necháváme otevřený, partnera zatím nedoporučujeme
  if (ok.length + missing.length >= need)
    return {
      status: "nejasné",
      calc: `${head}${names.length ? `: ${names.join("; ")}` : ""}.${tail} Doplň chybějící údaje v Nastavení → Firma, pak půjde požadavek posoudit.`,
      names: ok.map((r) => r.title),
    };
  return {
    status: "nesplněno",
    calc: `${head}${names.length ? `: ${names.join("; ")}` : ""}.${tail} Řešení: poddodavatel nebo společná nabídka (§ 83 ZZVZ).`,
    names: ok.map((r) => r.title),
  };
}

/** Přepočítá požadavky, které jdou ověřit čísly, a podle toho upraví stav i verdikt. */
export function applyChecks(a: Assessment, c: Company | null, refs: Reference[], now = new Date()): Assessment {
  const failed: string[] = [];
  const qualification = a.qualification.map((q): QualItem => {
    const r = q.kind === "obrat" ? turnover(q, c, now) : q.kind === "pojištění" ? insurance(q, c) : q.kind === "reference" ? references(q, refs, now) : null;
    if (!r) return q;
    // „doložit“ z výpočtu nepřebíjí „splněno“ od AI (viděla doklad v podkladech), ostatní stavy ano
    const status =
      r.status && !(r.status === "doložit" && q.status === "splněno")
        ? r.status
        : r.unsure && (q.status === "splněno" || q.status === "doložit")
          ? "nejasné"
          : q.status;
    if (r.status === "nesplněno" && q.status !== "nesplněno") failed.push(q.requirement);
    return { ...q, status, calc: r.calc, refNames: r.names };
  });
  if (failed.length && a.verdict === "podat")
    return {
      ...a,
      qualification,
      verdict: "podat s partnerem",
      verdictReason: `Výpočet z tvého profilu ukázal nesplněný požadavek: ${failed.join("; ")}. ${a.verdictReason}`,
    };
  return { ...a, qualification };
}

/** Vyjde zakázka cenově? Odhad pracnosti × denní sazba proti předpokladané hodnotě. Bez sazby nebo odhadu null. */
export function priceCheck(md: number, dayRate: number | null | undefined, value: number | null, currency: string | null): PriceCheck | null {
  if (!dayRate || !(md > 0)) return null;
  const cost = Math.round(md * dayRate);
  const base = `Odhad ${Math.round(md)} člověkodní × ${kc(dayRate)} = ${kc(cost)}`;
  if (!value || (currency ?? "CZK") !== "CZK")
    return { md, dayRate, cost, value: null, level: "bez hodnoty", text: `${base}. Zadavatel předpokládanou hodnotu neuvádí – nabídni aspoň tolik.` };
  const margin = (value - cost) / value;
  const pct = Math.round(Math.abs(margin) * 100);
  if (cost > value)
    return { md, dayRate, cost, value, level: "ztráta", text: `${base}; předpokládaná hodnota je ${kc(value)} → o ${pct} % méně, než tě práce stojí. Jde to jen s vlastním hotovým produktem, užším rozsahem nebo nižší sazbou.` };
  if (margin < 0.2)
    return { md, dayRate, cost, value, level: "těsné", text: `${base}; předpokládaná hodnota je ${kc(value)} → rezerva jen ${pct} %. Vítězná cena bývá pod předpokládanou hodnotou, takže to vyjde natěsno.` };
  return { md, dayRate, cost, value, level: "ok", text: `${base}; předpokládaná hodnota je ${kc(value)} → rezerva ${pct} %, prostor na soutěžní slevu je.` };
}
