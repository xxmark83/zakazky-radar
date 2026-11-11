// Výpočty k nabídce bez AI – sdílí je server (kalendář, ranní upozornění) i stránka.

// pracovní dny zpět od data (bez víkendů; svátky neznáme, proto je to jen odhad)
export function minusWorkdays(iso: string, n: number) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Poslední den na dotazy k zadávací dokumentaci: z AI rozboru, jinak odhad 8 pracovních dní před lhůtou
 * pro nabídky (bezpečná rezerva – přesnou lhůtu uvádí zadávací dokumentace).
 */
export function questionsDeadline(deadline: string | null, fromAnalysis?: string | null) {
  if (fromAnalysis && /^\d{4}-\d\d-\d\d/.test(fromAnalysis)) return { date: fromAnalysis.slice(0, 10), estimated: false };
  if (!deadline) return null;
  return { date: minusWorkdays(deadline, 8), estimated: true };
}

/**
 * Hrubý odhad šance na výhru (v %): rovný díl mezi obvyklý počet nabídek, upravený podle toho,
 * jak zakázka sedí (AI skóre), malého rozsahu a vlastní dosavadní úspěšnosti.
 */
export function winChance(o: {
  score: number; // 0–100, -1 = bez AI
  offersAvg: number | null; // průměrný počet nabídek u podobných zakázek
  small: boolean;
  ownWins: number;
  ownDecided: number;
}) {
  const bidders = Math.max(1, o.offersAvg ?? 3);
  let p = 1 / bidders;
  const why: string[] = [`podobné zakázky mívají průměrně ${bidders.toFixed(1).replace(".", ",")} nabídky`];
  if (o.score >= 0) {
    p *= 0.5 + o.score / 100;
    why.push(o.score >= 75 ? "zakázka dobře sedí na tvoji nabídku" : o.score >= 50 ? "zakázka sedí jen částečně" : "zakázka na tvoji nabídku moc nesedí");
  }
  if (o.small) {
    p *= 1.15;
    why.push("malý rozsah – méně konkurence a jednodušší podmínky");
  }
  if (o.ownDecided >= 3) {
    const own = o.ownWins / o.ownDecided;
    p = 0.7 * p + 0.3 * own;
    why.push(`tvoje úspěšnost zatím ${Math.round(own * 100)} % (${o.ownWins} z ${o.ownDecided})`);
  }
  const pct = Math.round(Math.min(0.7, Math.max(0.03, p)) * 100);
  return { pct, level: pct >= 35 ? "vysoká" : pct >= 15 ? "střední" : "nízká", why };
}
