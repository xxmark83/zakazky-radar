import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assignIds, canonFields, cluster, evidence } from "../lib/dedupe";
import type { Tender } from "../lib/types";

const tender = (id: string, title: string, buyer: string, published: string | null = null, extra: Partial<Tender> = {}): Tender => ({
  id, source: "Profily zadavatelů", kind: "open", title, buyer, published, deadline: null, value: null, currency: null, cpv: [], description: "", url: "", ...extra,
});
const T = "Stavební úpravy Městské knihovny v Táboře, Jiráskova 1775 - dodávka IT vybavení";
const ADDR = [
  "http://sluzby.e-zakazky.cz/ProfilZadavatele/DetailZadavatele.aspx?IDZ=980f29ec",
  "https://sluzby.e-zakazky.cz/profil-zadavatele/980f29ec",
  "https://www.e-zakazky.cz/Profil-Zadavatele/980f29ec",
];
const tabor = () => ADDR.flatMap((a) => [tender(`pz-${a}#P26V00000073`, T, "Město Tábor", "2026-08-11"), tender(`pz-${a}#P26V00000087`, T, "Město Tábor", "2026-09-08")]);

test("evidenční číslo a systém z id profilu", () => {
  assert.deepEqual(evidence({ id: `pz-${ADDR[1]}#P26V00000073` }), { system: "e-zakazky.cz", code: "P26V00000073" });
  assert.equal(evidence({ id: "ted-123-2026" }), null);
});

test("Tábor: dvě evidenční čísla = dvě řízení, tři adresy profilu se spojí", () => {
  const groups = cluster(tabor());
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.length), [3, 3]);
  for (const g of groups) assert.equal(new Set(g.map((t) => evidence(t)!.code)).size, 1);
});

test("Tábor v uložených datech (data/profily.json), pokud tam ještě je", () => {
  const rows: Tender[] = JSON.parse(readFileSync("data/profily.json", "utf8")).tenders
    .filter((r: { title: string }) => r.title === T)
    .map((r: { id: string; title: string; buyer: string; published: string | null }) => tender(r.id, r.title, r.buyer, r.published));
  if (!rows.length) return;
  const codes = new Set(rows.map((t) => evidence(t)?.code));
  assert.equal(cluster(rows).length, codes.size);
});

test("dřív spojená řízení se rozdělí: starší si nechá id (a stav), novější dostane vlastní", () => {
  const rows = tabor();
  const known = Object.fromEntries(rows.flatMap((t) => [[canonFields(t)[0], "stare-id"]]));
  const { tenders, save } = assignIds(cluster(rows), known);
  assert.equal(tenders.length, 2);
  const older = tenders.find((t) => t.published === "2026-08-11")!;
  const newer = tenders.find((t) => t.published === "2026-09-08")!;
  assert.equal(older.id, "stare-id");
  assert.notEqual(newer.id, "stare-id");
  assert.ok(Object.values(save).includes(newer.id));
  assert.deepEqual(newer.related, [{ code: "P26V00000073", published: "2026-08-11" }]);
  assert.deepEqual(older.related, [{ code: "P26V00000087", published: "2026-09-08" }]);
});

test("znovu vyhlášená zakázka sama (první už v datech není) nepřevezme id podle názvu", () => {
  const first = tender(`pz-${ADDR[1]}#P26V00000073`, T, "Město Tábor", "2026-08-11");
  const second = tender(`pz-${ADDR[1]}#P26V00000087`, T, "Město Tábor", "2026-09-08");
  const day1 = assignIds(cluster([first]), {});
  const known = { ...day1.save };
  const day2 = assignIds(cluster([second]), known);
  assert.notEqual(day2.tenders[0].id, day1.tenders[0].id);
});

test("stejná zakázka z různých zdrojů se dál spojuje", () => {
  const a = tender("ted-1", "Dodávka CRM systému pro město", "Město Kolín", "2026-10-01", { source: "TED", description: "popis" });
  const b = tender("pz-https://kolin.ezak.cz/profile_display_2.html#VZ-855", "Dodávka CRM systému pro město", "Město Kolín", "2026-10-02");
  const c = tender("nen-N006/26/V00012345", "Dodávka CRM systému pro město", "Město Kolín", "2026-10-03", { source: "NEN" });
  // jiný systém s jiným číslováním: čísla se nedají porovnat, je to tatáž zakázka
  const d = tender("pz-https://www.vhodne-uverejneni.cz/profil/kolin#P26V00000011", "Dodávka CRM systému pro město", "Město Kolín", "2026-10-02");
  assert.equal(cluster([a, b, c, d]).length, 1);
});

test("různí zadavatelé se stejným názvem se nespojí", () => {
  const a = tender("ted-1", "Dodávka výpočetní techniky", "Krajské ředitelství policie Jihočeského kraje");
  const b = tender("ted-2", "Dodávka výpočetní techniky", "Krajské ředitelství policie Plzeňského kraje");
  assert.equal(cluster([a, b]).length, 2);
});
