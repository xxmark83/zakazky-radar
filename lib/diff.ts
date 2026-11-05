import type { Change, ScoredTender } from "./types";

// Hlídání změn u zakázek, se kterými pracuji: posunutá lhůta, nový název, hodnota nebo doplněný popis.
// Porovnává uloženou podobu zakázky s čerstvou (z profilů zadavatelů nebo z posledního hledání).
const FIELDS: Change["field"][] = ["deadline", "title", "value", "description"];

const val = (t: Partial<ScoredTender>, f: Change["field"]) => String(t[f] ?? "").trim();

export function diff(old: ScoredTender, now: Partial<ScoredTender>, at = new Date().toISOString().slice(0, 10)): Change[] {
  return FIELDS.filter((f) => now[f] !== undefined && val(now, f) && val(old, f) !== val(now, f)).map((f) => ({
    field: f,
    from: f === "description" ? val(old, f).slice(0, 200) : val(old, f),
    to: f === "description" ? val(now, f).slice(0, 200) : val(now, f),
    at,
  }));
}
