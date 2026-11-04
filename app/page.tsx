"use client";

import { useEffect, useState } from "react";
import { MB_LOGO } from "@/lib/logo";
import { PRESETS } from "@/lib/presets";
import type { Award, ScoredTender, Status, WatchedProfile } from "@/lib/types";

const STATUS_LABEL: Record<Status, string> = { new: "Nové", maybe: "Zajímavé", bid: "Podám", no: "Ne" };
type Tab = "search" | "market" | "watch";
const TABS: Record<Tab, string> = {
  search: "Zakázky",
  market: "Průzkum trhu",
  watch: "Hlídání",
};

type ServerState = {
  db: boolean;
  email?: boolean;
  cron?: boolean;
  statuses?: Record<string, Status>;
  profiles?: WatchedProfile[];
  marked?: ScoredTender[];
  profily?: { updated: string; profiles: number; ok: number; open: number } | null;
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
  const [tab, setTab] = useState<Tab>("search");
  const [form, setForm] = useState({ ...PRESETS[0], days: 30, minScore: 40 });
  const [server, setServer] = useState<ServerState>({ db: false });
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [marked, setMarked] = useState<Record<string, ScoredTender>>({});

  useEffect(() => {
    const last = load<{ form?: typeof form }>("zr-form", {});
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
    <>
      <header className="top">
        <div className="top-in">
          <div className="brand">
            <svg viewBox="0 0 456 312" width="35" height="24" aria-hidden="true">
              <path fill="var(--accent)" fillRule="evenodd" d={MB_LOGO} />
            </svg>
            <span>Zakázky radar</span>
          </div>
          <nav className="tabs">
            {(Object.keys(TABS) as Tab[]).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {TABS[t]}
              </button>
            ))}
          </nav>
        </div>
      </header>
    <main>
      <section className="hero">
        <h1>{tab === "search" ? "Zakázky, které sedí na tvou nabídku" : tab === "watch" ? "Hlídání e-mailem" : TABS[tab]}</h1>
        <p className="sub">AI projde nové veřejné zakázky v celé ČR a vybere ty, kde máš reálnou šanci.</p>
        <div className="sources">
          <span className="chip">TED (EU)</span>
          <span className="chip">NEN</span>
          <span className="chip">
            {server.profily ? `${server.profily.ok.toLocaleString("cs-CZ")} profilů zadavatelů` : "profily zadavatelů"}
          </span>
          {server.profily && (
            <span className="chip muted">aktualizováno {new Date(server.profily.updated).toLocaleDateString("cs-CZ")}</span>
          )}
          {server.db && <span className="chip muted">databáze připojena</span>}
        </div>
      </section>

      <ProfileForm form={form} setForm={setForm} tab={tab} />

      {tab === "search" && <SearchTab form={form} statuses={statuses} marked={marked} setStatus={setStatus} />}
      {tab === "market" && <MarketTab form={form} />}
      {tab === "watch" && <WatchTab form={form} server={server} setServer={setServer} />}
    </main>
    </>
  );
}

const PRESET_HINT: Record<string, string> = {
  "CRM a zákaznické portály": "Malé CRM, klientské a občanské portály, helpdesk",
  "Vzdělávací portál": "E-learning, LMS, povinná školení zaměstnanců",
};

type Form = (typeof PRESETS)[number] & { days: number; minScore: number };

function ProfileForm({ form, setForm, tab }: { form: Form; setForm: (f: Form) => void; tab: Tab }) {
  return (
    <div className="card">
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.name} className={`preset ${form.name === p.name ? "on" : ""}`} onClick={() => setForm({ ...form, ...p })}>
            <b>{p.name}</b>
            <span>{PRESET_HINT[p.name] ?? p.keywords}</span>
          </button>
        ))}
      </div>
      <details>
        <summary>Upravit, co hledám</summary>
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
        {tab === "search" && (
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
      </details>
    </div>
  );
}

function SearchTab(props: {
  form: Form;
  statuses: Record<string, Status>;
  marked: Record<string, ScoredTender>;
  setStatus: (t: ScoredTender, s: Status) => void;
}) {
  const { form, statuses, marked, setStatus } = props;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [stats, setStats] = useState<{ total: number; open: number } | null>(null);
  const [results, setResults] = useState<ScoredTender[]>([]);
  const [filter, setFilter] = useState<Status | "all">("all");

  useEffect(() => setResults(load("zr-results", [])), []);

  // otevřené výzvy i připravované (předběžná oznámení, tržní konzultace) najednou
  async function search() {
    setLoading(true);
    setError("");
    setWarnings([]);
    try {
      const data = await Promise.all(
        (["open", "upcoming"] as const).map(async (mode) => {
          const res = await post("/api/search", { ...form, mode });
          const d = await res.json();
          if (!res.ok) throw new Error(d.error ?? `Chyba ${res.status}`);
          return d as { total: number; open: number; warnings?: string[]; results: ScoredTender[] };
        }),
      );
      const all = data.flatMap((d) => d.results).sort((a, b) => b.score - a.score);
      setWarnings([...new Set(data.flatMap((d) => d.warnings ?? []))]);
      setStats({ total: data[0].total + data[1].total, open: data[0].open + data[1].open });
      setResults(all);
      save("zr-results", all);
      save("zr-form", { form });
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
      : [...results, ...Object.values(marked).filter((m) => !results.some((r) => r.id === m.id))];
  const shown = pool.filter((r) => filter === "all" || (statuses[r.id] ?? "new") === filter);

  return (
    <>
      <button className="primary big" onClick={search} disabled={loading}>
        {loading ? "Stahuji a hodnotím… (až 1–2 min)" : "Najít zakázky"}
      </button>
      {error && <div className="warn">{error}</div>}
      {warnings.map((w) => (
        <div key={w} className="warn">
          {w}
        </div>
      ))}
      {stats && (
        <p className="stats">
          Prošel jsem {stats.open} aktuálních zakázek, vhodných je {results.length}.
        </p>
      )}
      {results.length > 0 && (
        <div className="filters">
          {(["all", "maybe", "bid", "no"] as const).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "all" ? "Vše" : STATUS_LABEL[f]}
            </button>
          ))}
        </div>
      )}
      <div className="list">
        {loading && [0, 1, 2].map((i) => <div key={i} className="card skeleton" />)}
        {!loading &&
          shown.map((t) => <TenderCard key={t.id} t={t} status={statuses[t.id] ?? "new"} setStatus={setStatus} />)}
        {!shown.length && !loading && (
          <div className="empty">
            <b>Zatím nic</b>
            <span>Klikni na Najít zakázky – hledání trvá asi minutu.</span>
          </div>
        )}
      </div>
    </>
  );
}

const daysLeft = (d: string | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000) : null);

function TenderCard({ t, status, setStatus }: { t: ScoredTender; status: Status; setStatus: (t: ScoredTender, s: Status) => void }) {
  const left = daysLeft(t.deadline);
  return (
    <article className={`card tender ${status === "no" ? "dim" : ""}`}>
      <div className="score" style={{ "--c": scoreColor(t.score), "--p": Math.max(t.score, 0) } as React.CSSProperties}>
        <span>{t.score < 0 ? "–" : t.score}</span>
      </div>
      <div className="tender-body">
        <div className="tags">
          <span className="tag">{t.source}</span>
          {t.kind === "upcoming" && <span className="tag soon">připravovaná</span>}
          {t.product && t.product !== "–" && <span className="tag accent">{t.product}</span>}
        </div>
        <h3>
          <a href={t.url} target="_blank" rel="noreferrer">
            {t.title || "(bez názvu)"}
          </a>
        </h3>
        <div className="meta">
          <span>{t.buyer}</span>
          {t.value ? <span>{money(t.value, t.currency)}</span> : null}
          {t.published && <span>zveřejněno {new Date(t.published).toLocaleDateString("cs-CZ")}</span>}
        </div>
        {t.reason && <p className="reason">{t.reason}</p>}
        <div className="tender-foot">
          {left !== null ? (
            <span className={`deadline ${left <= 3 ? "urgent" : ""}`}>
              {left <= 0 ? "lhůta končí dnes" : `lhůta za ${left} ${left === 1 ? "den" : left < 5 ? "dny" : "dní"}`}
              <small>{new Date(t.deadline!).toLocaleDateString("cs-CZ")}</small>
            </span>
          ) : (
            <span className="deadline none">lhůta neuvedena</span>
          )}
          <div className="actions">
            {(["maybe", "bid", "no"] as const).map((s) => (
              <button key={s} className={`${s} ${status === s ? "on" : ""}`} onClick={() => setStatus(t, status === s ? "new" : s)}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </article>
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
      <p className="note lead">Kdo a za kolik vyhrál podobné zakázky (výsledky řízení z TED). Ukáže reálné ceny a konkurenci.</p>
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
      <p className="note lead">
        Každé ráno (cca 6–7 h) se stáhnou nové otevřené i připravované zakázky, AI je ohodnotí a pošle e-mail jen s těmi nad
        zvoleným skóre, které ti ještě nepřišly.
      </p>
      <div className="card">
        <Check ok={server.cron} label="Ranní spouštění (CRON_SECRET)" />
        <Check ok={server.email} label="E-mail (RESEND_API_KEY + ALERT_EMAIL)" />
        <Check ok={server.db} label="Databáze – vlastní profily a bez duplicit (Upstash Redis)" />
        {!server.db && (
          <p className="note">Bez databáze se hlídá výchozí profil „CRM a zákaznické portály“ se skóre 75+.</p>
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
