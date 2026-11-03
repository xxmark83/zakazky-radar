"use client";

import { useEffect, useState } from "react";
import { PRESETS } from "@/lib/presets";
import type { Award, ScoredTender, Status, WatchedProfile } from "@/lib/types";

const STATUS_LABEL: Record<Status, string> = { new: "Nové", maybe: "Zajímavé", bid: "Podám", no: "Ne" };
type Tab = "open" | "upcoming" | "market" | "watch";
const TABS: Record<Tab, string> = {
  open: "Otevřené zakázky",
  upcoming: "Připravované",
  market: "Průzkum trhu",
  watch: "Hlídání e-mailem",
};

type ServerState = {
  db: boolean;
  email?: boolean;
  cron?: boolean;
  statuses?: Record<string, Status>;
  profiles?: WatchedProfile[];
  marked?: ScoredTender[];
};

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
const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const scoreColor = (s: number) => (s < 0 ? "var(--low)" : s >= 75 ? "var(--good)" : s >= 50 ? "var(--mid)" : "var(--low)");
const money = (v: number | null, c: string | null = "CZK") =>
  v ? `${Math.round(v).toLocaleString("cs-CZ")} ${c ?? ""}` : "hodnota neuvedena";

export default function Home() {
  const [tab, setTab] = useState<Tab>("open");
  const [form, setForm] = useState({ ...PRESETS[0], days: 30, minScore: 40 });
  const [server, setServer] = useState<ServerState>({ db: false });
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [marked, setMarked] = useState<Record<string, ScoredTender>>({});

  useEffect(() => {
    const last = load<{ form?: typeof form }>("zr-last", {});
    if (last.form) setForm(last.form);
    fetch("/api/state")
      .then((r) => r.json())
      .then((s: ServerState) => {
        setServer(s);
        if (s.db) {
          setStatuses(s.statuses ?? {});
          setMarked(Object.fromEntries((s.marked ?? []).map((t) => [t.id, t])));
        } else {
          setStatuses(load("zr-status", {}));
          setMarked(load("zr-marked", {}));
        }
      })
      .catch(() => setStatuses(load("zr-status", {})));
  }, []);

  const setStatus = (t: ScoredTender, s: Status) => {
    const next = { ...statuses, [t.id]: s };
    const nextMarked = { ...marked, [t.id]: t };
    if (s === "new") {
      delete next[t.id];
      delete nextMarked[t.id];
    }
    setStatuses(next);
    setMarked(nextMarked);
    if (server.db) post("/api/state", { status: { tender: t, value: s } });
    else {
      save("zr-status", next);
      save("zr-marked", nextMarked);
    }
  };

  return (
    <main>
      <h1>Zakázky radar</h1>
      <p className="sub">
        České veřejné zakázky + AI výběr podle tvé nabídky.{" "}
        <span className="tag">{server.db ? "databáze připojena" : "ukládá se jen v tomto prohlížeči"}</span>
      </p>

      <nav className="tabs">
        {(Object.keys(TABS) as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {TABS[t]}
          </button>
        ))}
      </nav>

      <ProfileForm form={form} setForm={setForm} tab={tab} />

      {(tab === "open" || tab === "upcoming") && (
        <SearchTab key={tab} mode={tab} form={form} statuses={statuses} marked={marked} setStatus={setStatus} />
      )}
      {tab === "market" && <MarketTab form={form} />}
      {tab === "watch" && <WatchTab form={form} server={server} setServer={setServer} />}
    </main>
  );
}

type Form = (typeof PRESETS)[number] & { days: number; minScore: number };

function ProfileForm({ form, setForm, tab }: { form: Form; setForm: (f: Form) => void; tab: Tab }) {
  return (
    <div className="card">
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.name} className={form.name === p.name ? "on" : ""} onClick={() => setForm({ ...form, ...p })}>
            {p.name}
          </button>
        ))}
      </div>
      {tab !== "market" && (
        <>
          <label>
            Co nabízím <span className="hint">– podle toho AI hodnotí každou zakázku</span>
          </label>
          <textarea value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })} />
        </>
      )}
      <label>
        Klíčová slova <span className="hint">– oddělit čárkou</span>
      </label>
      <input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
      <div className="row">
        <div>
          <label>
            CPV kódy <span className="hint">(prázdné = vše)</span>
          </label>
          <input value={form.cpv} onChange={(e) => setForm({ ...form, cpv: e.target.value })} />
        </div>
        {(tab === "open" || tab === "upcoming") && (
          <>
            <div>
              <label>Zveřejněno za posledních</label>
              <select value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}>
                {[7, 14, 30, 60, 90, 180].map((d) => (
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
          </>
        )}
      </div>
    </div>
  );
}

function SearchTab(props: {
  mode: "open" | "upcoming";
  form: Form;
  statuses: Record<string, Status>;
  marked: Record<string, ScoredTender>;
  setStatus: (t: ScoredTender, s: Status) => void;
}) {
  const { mode, form, statuses, marked, setStatus } = props;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [stats, setStats] = useState<{ total: number; open: number } | null>(null);
  const [results, setResults] = useState<ScoredTender[]>([]);
  const [filter, setFilter] = useState<Status | "all">("all");

  useEffect(() => setResults(load(`zr-results-${mode}`, [])), [mode]);

  async function search() {
    setLoading(true);
    setError("");
    setWarnings([]);
    try {
      const res = await post("/api/search", { ...form, mode });
      const data = await res.json();
      setWarnings(data.warnings ?? []);
      if (!res.ok) throw new Error(data.error ?? `Chyba ${res.status}`);
      setStats({ total: data.total, open: data.open });
      setResults(data.results);
      save(`zr-results-${mode}`, data.results);
      save("zr-last", { form });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // u filtru stavu ukázat i dříve označené zakázky, které už nejsou ve výsledcích
  const pool =
    filter === "all" || filter === "new"
      ? results
      : [...results, ...Object.values(marked).filter((m) => m.kind === mode && !results.some((r) => r.id === m.id))];
  const shown = pool.filter((r) => filter === "all" || (statuses[r.id] ?? "new") === filter);

  return (
    <>
      <p className="note">
        {mode === "open"
          ? "Výzvy, do kterých lze podat nabídku teď."
          : "Předběžná oznámení a předběžné tržní konzultace – šance mluvit se zadavatelem dřív, než napíše zadání."}
      </p>
      <button className="primary" onClick={search} disabled={loading}>
        {loading ? "Stahuji a hodnotím… (až 1–2 min)" : mode === "open" ? "Najít zakázky" : "Najít připravované"}
      </button>
      {error && <div className="warn">{error}</div>}
      {warnings.map((w) => (
        <div key={w} className="warn">
          {w}
        </div>
      ))}
      {stats && (
        <p className="stats">
          Staženo {stats.total} oznámení, aktuálních {stats.open}, vhodných {results.length}.
        </p>
      )}
      <div className="filters">
        {(["all", "new", "maybe", "bid", "no"] as const).map((f) => (
          <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
            {f === "all" ? "Vše" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="list">
        {shown.map((t) => (
          <TenderCard key={t.id} t={t} status={statuses[t.id] ?? "new"} setStatus={setStatus} />
        ))}
        {!shown.length && !loading && <p className="note">Zatím nic. Klikni na tlačítko výše.</p>}
      </div>
    </>
  );
}

function TenderCard({ t, status, setStatus }: { t: ScoredTender; status: Status; setStatus: (t: ScoredTender, s: Status) => void }) {
  return (
    <div className="card item" style={{ opacity: status === "no" ? 0.5 : 1 }}>
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
          <span>{money(t.value, t.currency)}</span>
          {t.deadline && <span>lhůta: {t.deadline}</span>}
          <span>zveřejněno: {t.published ?? "?"}</span>
          <span className="tag">{t.source}</span>
          {t.product && t.product !== "–" && <span className="tag">{t.product}</span>}
        </div>
        {t.reason && <p className="reason">{t.reason}</p>}
        <div className="actions">
          {(["maybe", "bid", "no"] as const).map((s) => (
            <button key={s} className={status === s ? "on" : ""} onClick={() => setStatus(t, status === s ? "new" : s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type Market = {
  count: number;
  prices: { count: number; p25: number | null; median: number | null; p75: number | null; min: number | null; max: number | null };
  topWinners: { name: string; wins: number; total: number }[];
  awards: Award[];
};

function MarketTab({ form }: { form: Form }) {
  const [days, setDays] = useState(730);
  const [useKeywords, setUseKeywords] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Market | null>(null);

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await post("/api/market", { cpv: form.cpv, keywords: useKeywords ? form.keywords : "", days });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <p className="note">Kdo a za kolik vyhrál podobné zakázky (výsledky řízení z TED). Ukáže reálné ceny a konkurenci.</p>
      <div className="row" style={{ marginTop: 8 }}>
        <div>
          <label>Období</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[365, 730, 1095, 1825].map((d) => (
              <option key={d} value={d}>
                posledních {d / 365} {d === 365 ? "rok" : d < 1825 ? "roky" : "let"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Hledat</label>
          <select value={useKeywords ? "kw" : "cpv"} onChange={(e) => setUseKeywords(e.target.value === "kw")}>
            <option value="kw">CPV + klíčová slova (přesnější)</option>
            <option value="cpv">jen CPV (širší)</option>
          </select>
        </div>
      </div>
      <button className="primary" onClick={run} disabled={loading}>
        {loading ? "Načítám…" : "Spustit průzkum"}
      </button>
      {error && <div className="warn">{error}</div>}

      {data && (
        <>
          <div className="kpis">
            <div className="card kpi">
              <div className="kpi-v">{data.count}</div>
              <div className="kpi-l">zadaných zakázek</div>
            </div>
            <div className="card kpi">
              <div className="kpi-v">{data.prices.median ? money(data.prices.median) : "–"}</div>
              <div className="kpi-l">medián ceny ({data.prices.count} s cenou)</div>
            </div>
            <div className="card kpi">
              <div className="kpi-v">
                {data.prices.p25 ? `${money(data.prices.p25, "")}– ${money(data.prices.p75)}` : "–"}
              </div>
              <div className="kpi-l">typické rozpětí (25.–75. percentil)</div>
            </div>
          </div>

          <h2>Nejčastější vítězové</h2>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Firma</th>
                  <th>Výher</th>
                  <th>Objem (Kč)</th>
                </tr>
              </thead>
              <tbody>
                {data.topWinners.map((w) => (
                  <tr key={w.name}>
                    <td>{w.name}</td>
                    <td>{w.wins}</td>
                    <td>{w.total ? Math.round(w.total).toLocaleString("cs-CZ") : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Zadané zakázky</h2>
          <div className="list">
            {data.awards.map((a) => (
              <div key={a.id} className="card">
                <h3 style={{ margin: 0, fontSize: 15 }}>
                  <a href={a.url} target="_blank" rel="noreferrer">
                    {a.title}
                  </a>
                </h3>
                <div className="meta">
                  <span>{a.buyer}</span>
                  <span>{money(a.value, a.currency)}</span>
                  <span>{a.published}</span>
                </div>
                <p className="reason">Vyhrál: {a.winners.join(", ") || "neuvedeno"}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function WatchTab({ form, server, setServer }: { form: Form; server: ServerState; setServer: (s: ServerState) => void }) {
  const profiles = server.profiles ?? [];
  const [msg, setMsg] = useState("");

  const store = async (next: WatchedProfile[]) => {
    setServer({ ...server, profiles: next });
    await post("/api/state", { profiles: next });
    setMsg("Uloženo.");
  };

  const addCurrent = () => {
    const p: WatchedProfile = { name: form.name, profile: form.profile, keywords: form.keywords, cpv: form.cpv, minScore: 75, watch: true };
    store([...profiles.filter((x) => x.name !== p.name), p]);
  };

  return (
    <>
      <p className="note">
        Každé ráno (cca 6–7 h) se stáhnou nové otevřené i připravované zakázky, AI je ohodnotí a pošle e-mail jen s těmi nad
        zvoleným skóre, které ti ještě nepřišly.
      </p>
      <div className="card">
        <Check ok={server.cron} label="Ranní spouštění (CRON_SECRET)" />
        <Check ok={server.email} label="E-mail (RESEND_API_KEY + ALERT_EMAIL)" />
        <Check ok={server.db} label="Databáze – vlastní profily a bez duplicit (Upstash Redis)" />
        {!server.db && (
          <p className="note">Bez databáze se hlídají výchozí profily Kotva CRM a Vzdělávací portál se skóre 75+.</p>
        )}
      </div>

      {server.db && (
        <>
          <button className="primary" onClick={addCurrent}>
            Hlídat aktuální profil „{form.name}“
          </button>
          {msg && <span className="note"> {msg}</span>}
          <div className="list" style={{ marginTop: 12 }}>
            {profiles.map((p) => (
              <div key={p.name} className="card watch">
                <b>{p.name}</b>
                <span className="note">{p.keywords}</span>
                <select
                  value={p.minScore}
                  onChange={(e) => store(profiles.map((x) => (x.name === p.name ? { ...x, minScore: Number(e.target.value) } : x)))}
                >
                  {[50, 60, 70, 75, 80, 90].map((s) => (
                    <option key={s} value={s}>
                      skóre {s}+
                    </option>
                  ))}
                </select>
                <button onClick={() => store(profiles.map((x) => (x.name === p.name ? { ...x, watch: !x.watch } : x)))}>
                  {p.watch ? "Pozastavit" : "Zapnout"}
                </button>
                <button onClick={() => store(profiles.filter((x) => x.name !== p.name))}>Smazat</button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Check({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <div style={{ margin: "4px 0" }}>
      <span style={{ color: ok ? "var(--good)" : "var(--muted)", fontWeight: 700 }}>{ok ? "✓" : "○"}</span> {label}
      {!ok && <span className="note"> – nenastaveno</span>}
    </div>
  );
}
