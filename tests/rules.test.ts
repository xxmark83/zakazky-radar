import { test } from "node:test";
import assert from "node:assert/strict";
import { applyChecks } from "../lib/qualify";
import { richness, stale } from "../lib/profile-key";
import { areasOf, combine, PRESETS } from "../lib/presets";
import { terms } from "../lib/sources/nen";

const NOW = new Date("2026-11-13");
const assessment = (q: object) => ({ verdict: "podat", verdictReason: "Sedí.", qualification: [{ requirement: "2 reference nad 1 mil. Kč", kind: "reference", status: "nejasné", ...q }] }) as never;
const ref = (title: string, value: number | null, year: string) => ({ title, client: "Město", value, year, description: "" }) as never;

test("prázdná knihovna referencí: nejasné a verdikt zůstává, žádný partner", () => {
  const r = applyChecks(assessment({ count: 1 }), null, [], NOW);
  assert.equal(r.verdict, "podat");
  assert.equal(r.qualification[0].status, "nejasné");
  assert.match(r.qualification[0].calc ?? "", /doplň/i);
});

test("reference bez vyplněné ceny: nejasné, ne partner", () => {
  const r = applyChecks(assessment({ count: 1, amount: 1_000_000, refs: [1] }), null, [ref("Portál", null, "2025")], NOW);
  assert.equal(r.verdict, "podat");
  assert.equal(r.qualification[0].status, "nejasné");
});

test("reference prokazatelně pod limitem: nesplněno a podat s partnerem", () => {
  const r = applyChecks(assessment({ count: 1, amount: 1_000_000, refs: [1] }), null, [ref("Portál", 300_000, "2025")], NOW);
  assert.equal(r.qualification[0].status, "nesplněno");
  assert.equal(r.verdict, "podat s partnerem");
});

test("vyhovující reference: splněno", () => {
  const r = applyChecks(assessment({ count: 1, amount: 1_000_000, years: 3, refs: [1] }), null, [ref("Portál", 2_000_000, "2025")], NOW);
  assert.equal(r.qualification[0].status, "splněno");
  assert.equal(r.verdict, "podat");
});

test("skóre se přepočítá jen při znatelně bohatších údajích", () => {
  const poor = { description: "", value: null, cpv: [] };
  const rich = { description: "x".repeat(600), value: 1_000_000, cpv: ["72000000"] };
  assert.equal(stale({ r: richness(poor) }, rich), true);
  assert.equal(stale({ r: richness(rich) }, rich), false);
  assert.equal(stale({ r: richness(rich) }, { ...rich, description: "y".repeat(640) }), false); // drobná změna textu
  assert.equal(stale({ r: richness(rich) }, poor), false); // chudší záznam (zdroj vypadl) nic nespouští
  assert.equal(stale({}, rich), false); // starší skóre bez údaje platí dál
});

test("štítky oblastí", () => {
  const a = (title: string) => areasOf({ title });
  assert.deepEqual(a("Penetrační testování infrastruktury a API"), ["Kybernetická bezpečnost", "MM security"]);
  assert.deepEqual(a("Penetrační nátěr vozovky"), []);
  assert.deepEqual(a("Nákup mobilních telefonů II"), []);
  assert.deepEqual(a("Vývoj mobilní aplikace pro občany"), ["Zakázky na míru (živnost)"]);
  assert.deepEqual(a("Audit zdrojového kódu"), ["MM security"]);
  assert.deepEqual(a("Revize elektroinstalace"), []);
});

test("NEN: při všech oblastech se ptá i na slova poslední oblasti", () => {
  const list = terms(combine(PRESETS.map((p) => p.name)).keywords.split(",").map((s) => s.trim()));
  for (const w of ["pentest", "penetrač", "zranitelno", "web", "crm"]) assert.ok(list.includes(w), w);
  assert.ok(list.length <= 50);
});
