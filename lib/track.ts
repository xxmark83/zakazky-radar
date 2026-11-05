import { diff } from "./diff";
import { profilyById } from "./sources/profily";
import type { Change, ScoredTender } from "./types";

/** Změny podle dnešních dat z profilů zadavatelů. Vrací změny a aktualizované zakázky. */
export function changesFromProfily(tenders: ScoredTender[]) {
  const fresh = profilyById(tenders.map((t) => t.id));
  const out: { tender: ScoredTender; changes: Change[] }[] = [];
  for (const t of tenders) {
    const f = fresh.get(t.id);
    if (!f) continue;
    // u profilů je v popisu i druh řízení, jako při hledání
    const now = { title: f.title, deadline: f.deadline };
    const changes = diff(t, now);
    if (changes.length) out.push({ tender: { ...t, ...now }, changes });
  }
  return out;
}
