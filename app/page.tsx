"use client";

import { useEffect, useState } from "react";
import type { ScoredTender } from "@/lib/types";

type Preset = { name: string; profile: string; keywords: string; cpv: string };

const PRESETS: Preset[] = [
  {
    name: "Kotva CRM",
    profile:
      "Nabízím levné cloudové CRM „Kotva“ pro správu kontaktů, klientů, obchodních případů, úkolů a komunikace. Vhodné pro úřady, příspěvkové organizace, obce a kraje (evidence žadatelů, agenda, helpdesk). Rychlé nasazení, nízká cena, úpravy na míru.",
    keywords: "CRM, evidence klientů, správa kontaktů, helpdesk, agendový systém",
    cpv: "48000000 72000000 48445000 72212445",
  },
  {
    name: "Vzdělávací portál",
    profile:
      "Nabízím vzdělávací portál / LMS: e-learningové kurzy, testy, certifikáty, evidence školení zaměstnanců, povinná školení (BOZP, GDPR, kyberbezpečnost). Ověřeno pilotem pro velkou státní firmu (Česká pošta). Levné SaaS řešení.",
    keywords: "e-learning, LMS, vzdělávací portál, školení zaměstnanců, vzdělávací systém",
    cpv: "80420000 80500000 48190000 72000000",
  },
  {
    name: "Vše IT / software",
    profile:
      "Malý dodavatel levných webových aplikací (CRM, vzdělávací portál, jednoduché agendové systémy, formuláře, portály). Hledám zakázky, kde mohu dodat menší SaaS aplikaci nebo být subdodavatelem.",
    keywords: "aplikace, portál, informační systém, software",
    cpv: "48000000 72000000",
  },
];

type Status = "new" | "maybe" | "bid" | "no";
const STATUS_LABEL: Record<Status, string> = { new: "Nové", maybe: "Zajímavé", bid: "Podám", no: "Ne" };

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

const scoreColor = (s: number) => (s < 0 ? "var(--low)" : s >= 75 ? "var(--good)" : s >= 50 ? "var(--mid)" : "var(--low)");
const fmtMoney = (v: number | null, c: string | null) =>
  v ? `${Math.round(v).toLocaleString("cs-CZ")} ${c ?? ""}` : "hodnota neuvedena";

export default function Home() {
  const [form, setForm] = useState({ ...PRESETS[0], days: 30, minScore: 40 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [stats, setStats] = useState<{ total: number; open: number } | null>(null);
  const [results, setResults] = useState<ScoredTender[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [filter, setFilter] = useState<Status | "all">("all");

  useEffect(() => {
    setStatuses(load("zr-status", {}));
    const last = load<{ form?: typeof form; results?: ScoredTender[] }>("zr-last", {});
    if (last.form) setForm(last.form);
    if (last.results) setResults(last.results);
  }, []);

  const setStatus = (id: string, s: Status) => {
    const next = { ...statuses, [id]: s };
    setStatuses(next);
    save("zr-status", next);
  };

  async function search() {
    setLoading(true);
    setError("");
    setWarnings([]);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setWarnings(data.warnings ?? []);
      if (!res.ok) throw new Error(data.error ?? `Chyba ${res.status}`);
      setStats({ total: data.total, open: data.open });
      setResults(data.results);
      save("zr-last", { form, results: data.results });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const shown = results.filter((r) => filter === "all" || (statuses[r.id] ?? "new") === filter);

  return (
    <main>
      <h1>Zakázky radar</h1>
      <p className="sub">Stáhne otevřené české veřejné zakázky a AI vybere ty, které sedí na tvoji nabídku.</p>

      <div className="card">
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.name} onClick={() => setForm({ ...form, ...p })}>
              {p.name}
            </button>
          ))}
        </div>

        <label>
          Co nabízím <span className="hint">– podle toho AI hodnotí každou zakázku</span>
        </label>
        <textarea value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })} />

        <label>
          Klíčová slova <span className="hint">– pro Hlídač státu (podlimitní zakázky), oddělit čárkou</span>
        </label>
        <input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />

        <div className="row">
          <div>
            <label>
              CPV kódy <span className="hint">(prázdné = vše)</span>
            </label>
            <input value={form.cpv} onChange={(e) => setForm({ ...form, cpv: e.target.value })} />
          </div>
          <div>
            <label>Zveřejněno za posledních</label>
            <select value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}>
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} dní
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Min. AI skóre</label>
            <select value={form.minScore} onChange={(e) => setForm({ ...form, minScore: Number(e.target.value) })}>
              {[0, 30, 40, 50, 70].map((s) => (
                <option key={s} value={s}>
                  {s}+
                </option>
              ))}
            </select>
          </div>
        </div>

        <button className="primary" onClick={search} disabled={loading}>
          {loading ? "Stahuji a hodnotím… (až 1–2 min)" : "Najít zakázky"}
        </button>
        {error && <div className="warn">{error}</div>}
        {warnings.map((w) => (
          <div key={w} className="warn">
            {w}
          </div>
        ))}
      </div>

      {stats && (
        <p className="stats">
          Staženo {stats.total} oznámení, otevřených {stats.open}, zobrazeno {results.length} vhodných.
        </p>
      )}

      {results.length > 0 && (
        <div className="filters">
          {(["all", "new", "maybe", "bid", "no"] as const).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? "Vše" : STATUS_LABEL[f]}
            </button>
          ))}
        </div>
      )}

      <div className="list">
        {shown.map((t) => {
          const st = statuses[t.id] ?? "new";
          return (
            <div key={t.id} className="card item" style={{ opacity: st === "no" ? 0.5 : 1 }}>
              <div className="score" style={{ background: scoreColor(t.score) }}>
                {t.score < 0 ? "–" : t.score}
              </div>
              <div>
                <h3>
                  <a href={t.url} target="_blank" rel="noreferrer">
                    {t.title || "(bez názvu)"}
                  </a>
                </h3>
                <div className="meta">
                  <span>{t.buyer}</span>
                  <span>{fmtMoney(t.value, t.currency)}</span>
                  <span>lhůta: {t.deadline ?? "?"}</span>
                  <span className="tag">{t.source}</span>
                  {t.product && t.product !== "–" && <span className="tag">{t.product}</span>}
                </div>
                {t.reason && <p className="reason">{t.reason}</p>}
                <div className="actions">
                  {(["maybe", "bid", "no"] as const).map((s) => (
                    <button
                      key={s}
                      className={st === s ? "on" : ""}
                      style={st === s ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
                      onClick={() => setStatus(t.id, st === s ? "new" : s)}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
