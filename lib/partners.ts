import { terms } from "./buyer";
import { bare } from "./match";
import { isvzAwards } from "./sources/isvz";
import type { Partner, Tender } from "./types";

// Když kvalifikaci sami nesplníme: kdo podobné zakázky vyhrává, a může tedy být partnerem ve společné nabídce
// nebo poddodavatelem (§ 83 ZZVZ). Z výsledků zadávacích řízení v ISVZ za poslední 3 roky – podle CPV zakázky,
// bez CPV podle slov z názvu.
const DAYS = 3 * 365;
const pad = (prefix: string) => prefix.padEnd(8, "0");

export function suggestPartners(t: Tender, own: string): Partner[] {
  let awards = [] as ReturnType<typeof isvzAwards>;
  const cpv = t.cpv.find((c) => /^\d{8}$/.test(c));
  if (cpv) {
    // nejdřív úzce (stejná pětimístná skupina CPV), když je výsledků málo, tak šířeji
    for (const len of [5, 4, 3]) {
      awards = isvzAwards({ cpv: [pad(cpv.slice(0, len))], keywords: [], days: DAYS });
      if (awards.length >= 8) break;
    }
  } else {
    const stems = terms(t.title).slice(0, 8);
    if (stems.length) {
      // bez CPV jen podle názvu: chtít shodu ve většině slov, jinak vyjdou firmy z úplně jiného oboru
      const need = stems.length >= 4 ? 3 : stems.length >= 2 ? 2 : 1;
      awards = isvzAwards({ cpv: [], keywords: [], days: DAYS }).filter((a) => {
        const title = bare(a.title);
        return stems.filter((s) => title.includes(s)).length >= need;
      });
    }
  }
  const me = bare(own.replace(/,?\s*(spol\.\s*s\s*r\.\s*o\.|s\.\s*r\.\s*o\.|a\.\s*s\.)\s*$/i, ""));
  const firms = new Map<string, Partner & { last: string }>();
  for (const a of awards) {
    for (const w of a.winners) {
      const key = bare(w);
      if (!key || (me.length >= 3 && key.includes(me))) continue;
      const cur = firms.get(key) ?? { name: w, wins: 0, total: null, example: "", last: "" };
      cur.wins++;
      if (a.value && (a.currency ?? "CZK") === "CZK") cur.total = (cur.total ?? 0) + a.value / a.winners.length;
      if ((a.published ?? "") >= cur.last) {
        cur.last = a.published ?? "";
        cur.example = `${a.title} – ${a.buyer}${a.published ? ` (${a.published.slice(0, 4)})` : ""}`.slice(0, 180);
      }
      firms.set(key, cur);
    }
  }
  return [...firms.values()]
    .sort((a, b) => b.wins - a.wins || (b.total ?? 0) - (a.total ?? 0))
    .slice(0, 5)
    .map(({ last, ...p }) => p);
}
