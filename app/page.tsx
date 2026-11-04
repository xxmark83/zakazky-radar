"use client";

import { useEffect, useRef, useState } from "react";
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
const post = (url: string, body: unknown, signal?: AbortSignal) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });

const scoreColor = (s: number) => (s < 0 ? "var(--low)" : s >= 75 ? "var(--good)" : s >= 50 ? "var(--mid)" : "var(--low)");
const scoreLabel = (s: number) => (s < 0 ? "bez AI" : s >= 75 ? "sedí" : s >= 50 ? "částečně" : "slabě");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const today = () => new Date().toISOString().slice(0, 10);

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// tabulka pro Excel: středník a BOM, aby se správně načetla čeština
function exportCsv(rows: ScoredTender[]) {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["Skóre", "Název", "Zadavatel", "Zdroj", "Lhůta", "Hodnota", "Produkt", "Proč", "Odkaz"],
    ...rows.map((t) => [t.score < 0 ? "" : t.score, t.title, t.buyer, t.source, t.deadline, t.value ? Math.round(t.value) : "", t.product, t.reason, t.url]),
  ].map((r) => r.map(esc).join(";"));
  download(`zakazky-${today()}.csv`, "\uFEFF" + lines.join("\r\n"), "text/csv;charset=utf-8");
}

// lhůta do kalendáře s připomenutím 2 dny předem
function exportIcs(t: ScoredTender) {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const day = t.deadline!.replace(/-/g, "");
  const text = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//zakazky-radar//CS",
    "BEGIN:VEVENT",
    `UID:${t.id}@zakazky-radar`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${day}`,
    `SUMMARY:${esc(`Lhůta: ${t.title}`)}`,
    `DESCRIPTION:${esc(`${t.buyer}\n${t.url}`)}`,
    `URL:${t.url}`,
    "BEGIN:VALARM",
    "TRIGGER:-P2D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Lhůta za 2 dny",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  download(`lhuta-${t.id}.ics`, text, "text/calendar");
}

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

  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const applyStatus = (t: ScoredTender, s: Status) => {
    setStatuses((cur) => {
      const next = { ...cur, [t.id]: s };
      if (s === "new") delete next[t.id];
      if (!server.db) save("zr-status", next);
      return next;
    });
    setMarked((cur) => {
      const next = { ...cur, [t.id]: t };
      if (s === "new") delete next[t.id];
      if (!server.db) save("zr-marked", next);
      return next;
    });
    if (server.db) post("/api/state", { status: { tender: t, value: s } });
  };

  const setStatus = (t: ScoredTender, s: Status) => {
    const prev = statuses[t.id] ?? "new";
    applyStatus(t, s);
    if (s === "no") setToast({ text: "Zakázka skryta", undo: () => applyStatus(t, prev) });
    else if (s === "bid") setToast({ text: "Přidáno mezi zakázky, kde podáš nabídku" });
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

      {tab === "search" && (
        <SearchTab form={form} statuses={statuses} marked={marked} setStatus={setStatus} profily={server.profily?.ok} />
      )}
      {tab === "market" && <MarketTab form={form} />}
      {tab === "watch" && <WatchTab form={form} server={server} setServer={setServer} />}
    </main>
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo!();
                setToast(null);
              }}
            >
              Vrátit
            </button>
          )}
        </div>
      )}
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

type Sort = "score" | "deadline" | "new";
const SORTS: Record<Sort, string> = { score: "Nejlépe sedí", deadline: "Nejbližší lhůta", new: "Nejnovější" };
const CMP: Record<Sort, (a: ScoredTender, b: ScoredTender) => number> = {
  score: (a, b) => b.score - a.score,
  deadline: (a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"),
  new: (a, b) => (b.published ?? "").localeCompare(a.published ?? ""),
};

function SearchTab(props: {
  form: Form;
  statuses: Record<string, Status>;
  marked: Record<string, ScoredTender>;
  setStatus: (t: ScoredTender, s: Status) => void;
  profily?: number;
}) {
  const { form, statuses, marked, setStatus, profily } = props;
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [stats, setStats] = useState<{ total: number; open: number } | null>(null);
  const [results, setResults] = useState<ScoredTender[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState<Sort>("score");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    setResults(load("zr-results", []));
    setFresh(new Set(load<string[]>("zr-fresh", [])));
    setSort(load("zr-sort", "score"));
  }, []);

  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  // otevřené výzvy i připravované (předběžná oznámení, tržní konzultace) najednou
  async function search() {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLoading(true);
    setError("");
    setWarnings([]);
    try {
      const data = await Promise.all(
        (["open", "upcoming"] as const).map(async (mode) => {
          const res = await post("/api/search", { ...form, mode }, ctrl.signal);
          const d = await res.json();
          if (!res.ok) throw new Error(d.error ?? `Chyba ${res.status}`);
          return d as { total: number; open: number; warnings?: string[]; results: ScoredTender[] };
        }),
      );
      const all = data.flatMap((d) => d.results).sort((a, b) => b.score - a.score);
      // co přibylo od minulého hledání
      const before = new Set(load<ScoredTender[]>("zr-results", []).map((r) => r.id));
      const added = before.size ? all.filter((r) => !before.has(r.id)).map((r) => r.id) : [];
      setFresh(new Set(added));
      setWarnings([...new Set(data.flatMap((d) => d.warnings ?? []))]);
      setStats({ total: data[0].total + data[1].total, open: data[0].open + data[1].open });
      setResults(all);
      save("zr-results", all);
      save("zr-fresh", added);
      save("zr-form", { form });
    } catch (e: any) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const changeSort = (s: Sort) => {
    setSort(s);
    save("zr-sort", s);
  };

  // „Vše“ skrývá odmítnuté; u filtru stavu ukázat i dříve označené zakázky, které už nejsou ve výsledcích
  const pool =
    filter === "all"
      ? results.filter((r) => statuses[r.id] !== "no")
      : [...results, ...Object.values(marked).filter((m) => !results.some((r) => r.id === m.id))].filter(
          (r) => statuses[r.id] === filter,
        );
  const q = norm(query.trim());
  const shown = pool
    .filter((r) => source === "all" || r.source === source)
    .filter((r) => !q || norm(`${r.title} ${r.buyer} ${r.product} ${r.reason}`).includes(q))
    .sort(CMP[sort]);
  const count = (s: Status) => Object.values(statuses).filter((x) => x === s).length;
  const sources = [...new Set(results.map((r) => r.source))];
  const narrowed = Boolean(q) || source !== "all";

  const bids = Object.values(marked)
    .filter((t) => statuses[t.id] === "bid" && t.deadline && t.deadline >= today())
    .sort(CMP.deadline)
    .slice(0, 3);

  return (
    <>
      {loading ? (
        <div className="card progress">
          <div className="radar" aria-hidden="true" />
          <div className="progress-text">
            <b>
              Prohledávám TED, NEN a {profily ? `${profily.toLocaleString("cs-CZ")} profilů zadavatelů` : "profily zadavatelů"}
            </b>
            <span>
              AI hodnotí každou zakázku podle tvé nabídky, obvykle 1–2 minuty. {Math.floor(elapsed / 60)}:
              {String(elapsed % 60).padStart(2, "0")}
            </span>
          </div>
          <button onClick={() => abort.current?.abort()}>Zrušit</button>
        </div>
      ) : (
        <button className="primary big" onClick={search}>
          {results.length ? "Hledat znovu" : "Najít zakázky"}
        </button>
      )}
      {error && <div className="warn">{error}</div>}
      {warnings.map((w) => (
        <div key={w} className="warn">
          {w}
        </div>
      ))}

      {bids.length > 0 && (
        <div className="card mine">
          <div className="mine-head">
            <b>Podáváš nabídku</b>
            <button className="link" onClick={() => setFilter("bid")}>
              Zobrazit vše
            </button>
          </div>
          {bids.map((t) => (
            <a key={t.id} className="mine-row" href={t.url} target="_blank" rel="noreferrer">
              <span>{t.title}</span>
              <Deadline d={t.deadline} short />
            </a>
          ))}
        </div>
      )}

      {stats && !loading && (
        <p className="stats">
          Prošel jsem {stats.open.toLocaleString("cs-CZ")} aktuálních zakázek, vhodných je {results.length}
          {fresh.size > 0 && <>, z toho {fresh.size} nových od minula</>}.
        </p>
      )}
      {(results.length > 0 || Object.keys(statuses).length > 0) && !loading && (
        <>
          <div className="filters">
            {(["all", "maybe", "bid", "no"] as const).map((f) => (
              <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {f === "all" ? "Vše" : STATUS_LABEL[f]}
                {f !== "all" && count(f) > 0 && <span className="count">{count(f)}</span>}
              </button>
            ))}
          </div>
          <div className="toolbar">
            <input
              type="search"
              placeholder="Hledat v názvu, zadavateli…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {sources.length > 1 && (
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="all">Všechny zdroje</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s} ({results.filter((r) => r.source === s).length})
                  </option>
                ))}
              </select>
            )}
            <select value={sort} onChange={(e) => changeSort(e.target.value as Sort)}>
              {(Object.keys(SORTS) as Sort[]).map((s) => (
                <option key={s} value={s}>
                  {SORTS[s]}
                </option>
              ))}
            </select>
            <button onClick={() => exportCsv(shown)} disabled={!shown.length} title="Stáhnout zobrazené zakázky pro Excel">
              Excel
            </button>
          </div>
        </>
      )}
      <div className="list">
        {loading && [0, 1, 2].map((i) => <div key={i} className="card skeleton" />)}
        {!loading &&
          shown.map((t) => (
            <TenderCard key={t.id} t={t} fresh={fresh.has(t.id)} status={statuses[t.id] ?? "new"} setStatus={setStatus} />
          ))}
        {!shown.length && !loading && (
          <div className="empty">
            {narrowed ? (
              <>
                <b>Filtru nic neodpovídá</b>
                <button
                  className="link"
                  onClick={() => {
                    setQuery("");
                    setSource("all");
                  }}
                >
                  Zrušit filtr
                </button>
              </>
            ) : filter !== "all" ? (
              <>
                <b>Tady zatím nic není</b>
                <span>Zakázky sem přesuneš tlačítky u každé z nich.</span>
              </>
            ) : (
              <>
                <b>Zatím nic</b>
                <span>Klikni na Najít zakázky, hledání trvá asi minutu.</span>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

const daysLeft = (d: string | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000) : null);

function Deadline({ d, short }: { d: string | null; short?: boolean }) {
  const left = daysLeft(d);
  if (left === null) return <span className="deadline none">lhůta neuvedena</span>;
  return (
    <span className={`deadline ${left <= 3 ? "urgent" : left <= 7 ? "soon" : ""}`}>
      {left <= 0 ? "končí dnes" : `${short ? "" : "lhůta "}za ${left} ${left === 1 ? "den" : left < 5 ? "dny" : "dní"}`}
      <small>{new Date(d!).toLocaleDateString("cs-CZ")}</small>
    </span>
  );
}

function TenderCard(props: { t: ScoredTender; fresh: boolean; status: Status; setStatus: (t: ScoredTender, s: Status) => void }) {
  const { t, fresh, status, setStatus } = props;
  return (
    <article className={`card tender ${status === "no" ? "dim" : ""} ${status !== "new" ? `is-${status}` : ""}`}>
      <div className="score-col">
        <div className="score" style={{ "--c": scoreColor(t.score), "--p": Math.max(t.score, 0) } as React.CSSProperties}>
          <span>{t.score < 0 ? "–" : t.score}</span>
        </div>
        <small style={{ color: scoreColor(t.score) }}>{scoreLabel(t.score)}</small>
      </div>
      <div className="tender-body">
        <div className="tags">
          {fresh && <span className="tag fresh">nová</span>}
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
        {t.description && (
          <details className="more">
            <summary>Popis zakázky</summary>
            <p>{t.description}</p>
          </details>
        )}
        <div className="tender-foot">
          <div className="foot-left">
            <Deadline d={t.deadline} />
            {t.deadline && (
              <button className="link" onClick={() => exportIcs(t)} title="Přidat lhůtu do kalendáře s připomenutím">
                do kalendáře
              </button>
            )}
          </div>
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
                    <td>
                      {w.name}
                      <div className="bar" style={{ width: `${(w.wins / data.topWinners[0].wins) * 100}%` }} />
                    </td>
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
    <div className={`check ${ok ? "ok" : ""}`}>
      <span className="dot" aria-hidden="true">{ok ? "✓" : ""}</span>
      <span>{label}</span>
      <span className="state">{ok ? "nastaveno" : "nenastaveno"}</span>
    </div>
  );
}
