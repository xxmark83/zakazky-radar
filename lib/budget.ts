import { getSpend, getState, redis } from "./store";

// Měsíční limit útraty za AI. Hlídá ho server před každým placeným voláním (hledání, ranní běh, posouzení,
// rozbor, dotazy) – dřív o něm rozhodoval jen prohlížeč a ranní hodnocení ho nekontrolovalo vůbec.
// Limit si účet volí v Nastavení (zr-prefs.budget), jinak platí AI_BUDGET_USD nebo 5 $.
export async function aiBudget(): Promise<{ spent: number; budget: number; left: boolean }> {
  if (!redis) return { spent: 0, budget: Infinity, left: true }; // bez databáze není kde útratu počítat
  const ui = ((await getState()) as { ui?: Record<string, { budget?: number } | undefined> }).ui ?? {};
  const budget = Number(ui["zr-prefs"]?.budget) || Number(process.env.AI_BUDGET_USD) || 5;
  const spent = (await getSpend()) ?? 0;
  return { spent, budget, left: spent < budget };
}
export const aiBudgetLeft = async () => (await aiBudget().catch(() => ({ left: true }))).left;
export const BUDGET_ERROR = "Měsíční limit za AI je vyčerpaný. Zvyš ho v Nastavení → AI a data, nebo počkej na další měsíc.";
