"use client";

import { useEffect, useRef, useState } from "react";
import { MB_LOGO } from "@/lib/logo";
import { PRESETS } from "@/lib/presets";
import { diff } from "@/lib/diff";
import { profileKey } from "@/lib/profile-key";
import { REGIONS } from "@/lib/regions";
import type { Analysis, Award, Change, Draft, Score, ScoredTender, Status, WatchedProfile } from "@/lib/types";

const STATUS_LABEL: Record<Status, string> = {
  new: "Nové",
  maybe: "Zvažuji",
  bid: "Připravuji",
  sent: "Podáno",
  won: "Vyhráno",
  lost: "Nevyšlo",
  no: "Ne",
};
// tlačítka u zakázky ve výsledcích hledání
const ACTIONS: { s: Status; label: string; icon: IconName }[] = [
  { s: "maybe", label: "Zvažuji", icon: "star" },
  { s: "bid", label: "Podám", icon: "check" },
  { s: "no", label: "Ne", icon: "x" },
];
// tenké čárové ikony (24×24), aby se dalo rychle zorientovat bez čtení
const ICONS = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35",
  board: "M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z",
  chart: "M3 3v18h18M8 17v-6M13 17V7M18 17v-4",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  building: "M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4",
  money: "M3 6h18v12H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  pin: "M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2",
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  download: "M12 3v12m0 0-4-4m4 4 4-4M4 21h16",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  cap: "M22 10 12 5 2 10l10 5 10-5ZM6 12v5c3 2 9 2 12 0v-5",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-4",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  radar: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-4a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-6 7-7",
};
type IconName = keyof typeof ICONS;
function Icon({ n, size = 16 }: { n: IconName; size?: number }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={ICONS[n]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Tab = "search" | "board" | "market" | "watch";
const TABS: Record<Tab, string> = {
  search: "Zakázky",
  board: "Moje zakázky",
  market: "Průzkum trhu",
  watch: "Hlídání",
};
const TAB_ICON: Record<Tab, IconName> = { search: "search", board: "board", market: "chart", watch: "bell" };

type ServerState = {
  db: boolean;
  email?: boolean;
  cron?: boolean;
  statuses?: Record<string, Status>;
  profiles?: WatchedProfile[];
  marked?: ScoredTender[];
  profily?: { updated: string; profiles: number; ok: number; open: number } | null;
  kept?: Kept | null;
  spend?: number | null;
  budget?: number;
  model?: Model;
  ai?: boolean;
  ui?: Record<string, unknown>;
};

// poznámky, AI rozbory, návrhy nabídek a změny – v databázi, bez ní v prohlížeči
type Kept = {
  notes: Record<string, string>;
  analysis: Record<string, Analysis>;
  drafts: Record<string, Draft>;
  changes: Record<string, Change[]>;
};
type KeptKind = keyof Kept;
const EMPTY_KEPT: Kept = { notes: {}, analysis: {}, drafts: {}, changes: {} };
type Keep = <K extends KeptKind>(kind: K, id: string, value: Kept[K][string] | null) => void;

type Model = "opus" | "haiku";
type Prefs = { model: Model; budget: number; slovakia: boolean };
const MODEL_LABEL: Record<Model, string> = { opus: "Opus – přesnější", haiku: "Haiku – asi 40× levnější" };
// co AI potřebuje vědět od komponent: model, jestli je limit vyčerpaný, a kam hlásit útratu
type Ai = { model: Model; noAi: boolean; slovakia: boolean; onCost: (usd: number) => void };
const usd = (v: number) => `${v < 0.01 && v > 0 ? "<0,01" : v.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} $`;
const thisMonth = () => new Date().toISOString().slice(0, 7);
// sledované = rozpracované zakázky, u kterých hlídáme změny
const ACTIVE: Status[] = ["maybe", "bid", "sent"];

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
const post = (url: string, body: unknown, signal?: AbortSignal) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });

// S databází se tyto klíče sdílí mezi zařízeními (lib/store.ts UI_KEYS): výsledky, volby, filtry a vzhled.
const SYNCED = ["zr-results", "zr-fresh", "zr-form", "zr-prefs", "zr-sort", "zr-region", "zr-value", "zr-theme"];
let syncOn = false;
const syncUi = (key: string, v: unknown) => {
  if (!syncOn || !SYNCED.includes(key)) return;
  // dlouhé popisy zkrátit, ať se stovky výsledků vejdou do limitu požadavku (4,5 MB)
  const value = key === "zr-results" ? (v as ScoredTender[]).map((t) => ({ ...t, description: t.description?.slice(0, 1500) })) : v;
  post("/api/state", { ui: { [key]: value } }).catch(() => {});
};
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
  syncUi(key, v);
}

// vzhled je v prohlížeči jako holý text, protože ho čte skript v layout.tsx ještě před vykreslením
function applyTheme(t: Theme) {
  try {
    if (t === "auto") localStorage.removeItem("zr-theme");
    else localStorage.setItem("zr-theme", t);
  } catch {}
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

// po načtení: co je v databázi, přepíše prohlížeč; co v databázi ještě chybí, nahraje se tam
function mergeUi(ui: Record<string, unknown>) {
  const missing: Record<string, unknown> = {};
  for (const k of SYNCED) {
    if (k in ui) {
      if (k === "zr-theme") applyTheme(ui[k] as Theme);
      else
        try {
          localStorage.setItem(k, JSON.stringify(ui[k]));
        } catch {}
      continue;
    }
    try {
      const raw = localStorage.getItem(k);
      if (raw !== null) missing[k] = k === "zr-theme" ? raw : JSON.parse(raw);
    } catch {}
  }
  syncOn = true;
  if (Object.keys(missing).length) post("/api/state", { ui: missing }).catch(() => {});
}

const scoreColor = (s: number) => (s < 0 ? "var(--low)" : s >= 75 ? "var(--good)" : s >= 50 ? "var(--mid)" : "var(--low)");
const scoreLabel = (s: number) => (s < 0 ? "bez AI" : s >= 75 ? "sedí" : s >= 50 ? "částečně" : "slabě");
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const today = () => new Date().toISOString().slice(0, 10);

// Skóre se pamatují podle textu „Co nabízím“ (lib/profile-key.ts) – po jeho změně AI hodnotí znovu.
const SCORE_CAP = 5000;
const loadScores = (profile: string) =>
  load<Record<string, Record<string, Score>>>("zr-scores", {})[profileKey(profile)] ?? {};
function saveScores(profile: string, add: Record<string, Score>) {
  const all = load<Record<string, Record<string, Score>>>("zr-scores", {});
  const key = profileKey(profile);
  // nejnovější nakonec, nejstarší nad limit pryč; od ostatních profilů nechat nejvýš dva
  const merged = Object.entries({ ...all[key], ...add }).slice(-SCORE_CAP);
  save("zr-scores", { [key]: Object.fromEntries(merged), ...Object.fromEntries(Object.entries(all).filter(([k]) => k !== key).slice(0, 2)) });
}

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
// krátce pro přehled: 2,4 mil. Kč
const moneyShort = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} mil. Kč` : `${Math.round(v / 1e3)} tis. Kč`;

export default function Home() {
  const [tab, setTab] = useState<Tab>("search");
  const [form, setForm] = useState({ ...PRESETS[0], days: 30, minScore: 40 });
  const [server, setServer] = useState<ServerState>({ db: false });
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [marked, setMarked] = useState<Record<string, ScoredTender>>({});
  const [detail, setDetail] = useState<ScoredTender | null>(null);
  const [competitor, setCompetitor] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [kept, setKept] = useState<Kept>(EMPTY_KEPT);
  const [spent, setSpent] = useState(0);
  const [prefs, setPrefs] = useState<Prefs>({ model: "haiku", budget: 5, slovakia: false });
  const [ready, setReady] = useState(false);
  // po načtení dat z databáze se záložky s výsledky vykreslí znovu
  const [synced, setSynced] = useState(0);

  useEffect(() => {
    const last = load<{ form?: typeof form }>("zr-form", {});
    if (last.form) setForm(last.form);
    const local = () => {
      setStatuses(load("zr-status", {}));
      setMarked(load("zr-marked", {}));
      setKept({ ...EMPTY_KEPT, ...load<Partial<Kept>>("zr-kept", {}) });
      const sp = load<{ month: string; usd: number }>("zr-spend", { month: "", usd: 0 });
      setSpent(sp.month === thisMonth() ? sp.usd : 0);
    };
    fetch("/api/state")
      .then((r) => r.json())
      .then((s: ServerState) => {
        setServer(s);
        if (s.db) {
          mergeUi(s.ui ?? {});
          const f = load<{ form?: typeof form }>("zr-form", {});
          if (f.form) setForm(f.form);
          setSynced((n) => n + 1);
        }
        setPrefs({ model: s.model ?? "haiku", budget: s.budget ?? 5, slovakia: false, ...load<Partial<Prefs>>("zr-prefs", {}) });
        if (s.db) {
          setStatuses(s.statuses ?? {});
          setMarked(Object.fromEntries((s.marked ?? []).map((t) => [t.id, t])));
          setKept({ ...EMPTY_KEPT, ...s.kept });
          setSpent(s.spend ?? 0);
        } else local();
      })
      .catch(local)
      .finally(() => setReady(true));
  }, []);

  const keep: Keep = (kind, id, value) => {
    setKept((cur) => {
      const part = { ...cur[kind] } as Record<string, unknown>;
      if (value === null || value === "") delete part[id];
      else part[id] = value;
      const next = { ...cur, [kind]: part };
      if (!server.db) save("zr-kept", next);
      return next;
    });
    if (server.db) post("/api/state", { kept: { kind, id, value } });
  };

  const onCost = (c: number) => {
    if (!c) return;
    setSpent((cur) => {
      const next = cur + c;
      if (!server.db) save("zr-spend", { month: thisMonth(), usd: next });
      return next;
    });
  };
  const ai: Ai = { model: prefs.model, noAi: spent >= prefs.budget, slovakia: prefs.slovakia, onCost };
  // vybraná volba a úpravy „Co hledám“ se sdílí i bez hledání
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => save("zr-form", { form }), 800);
    return () => clearTimeout(id);
  }, [form, ready]);

  const savePrefs = (p: typeof prefs) => {
    setPrefs(p);
    save("zr-prefs", p);
  };

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

  // změny u sledovaných zakázek: uložit seznam změn a novou podobu zakázky
  const applyChanges = (found: { tender: ScoredTender; changes: Change[] }[]) => {
    for (const f of found) {
      keep("changes", f.tender.id, [...(kept.changes[f.tender.id] ?? []), ...f.changes]);
      applyStatus(f.tender, statuses[f.tender.id]);
    }
    if (found.length)
      setToast({ text: `Změna u ${found.length} ${found.length === 1 ? "sledované zakázky" : "sledovaných zakázek"} – viz Moje zakázky` });
  };
  const active = () => Object.values(marked).filter((t) => ACTIVE.includes(statuses[t.id]));
  const checkResults = (results: ScoredTender[]) => {
    const byId = new Map(results.map((r) => [r.id, r]));
    applyChanges(
      active().flatMap((t) => {
        const now = byId.get(t.id);
        const changes = now ? diff(t, now) : [];
        return changes.length ? [{ tender: { ...t, ...now, score: t.score, reason: t.reason }, changes }] : [];
      }),
    );
  };

  // jednou denně porovnat sledované zakázky s čerstvými daty z profilů zadavatelů
  useEffect(() => {
    if (!ready || load("zr-checked", "") === today()) return;
    const list = active();
    save("zr-checked", today());
    if (!list.length) return;
    post("/api/changes", { tenders: list })
      .then((r) => r.json())
      .then((d) => applyChanges(d.found ?? []))
      .catch(() => {});
  }, [ready]);

  const setStatus = (t: ScoredTender, s: Status) => {
    const prev = statuses[t.id] ?? "new";
    applyStatus(t, s);
    if (s === "no") setToast({ text: "Zakázka skryta", undo: () => applyStatus(t, prev) });
    else if (s === "bid") setToast({ text: "Přidáno do Moje zakázky → Připravuji" });
    else if (s === "won") setToast({ text: "Gratuluji k výhře!" });
  };

  // rozpracované zakázky – číslo u záložky Moje zakázky
  const working = Object.values(statuses).filter((s) => s === "maybe" || s === "bid" || s === "sent").length;

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
          <div className="top-right">
          <nav className="tabs">
            {(Object.keys(TABS) as Tab[]).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                <Icon n={TAB_ICON[t]} />
                <span className="long">{TABS[t]}</span>
                <span className="short">{TAB_SHORT[t]}</span>
                {t === "board" && working > 0 && <span className="badge">{working}</span>}
              </button>
            ))}
          </nav>
          <button className="icon gear" onClick={() => setSettings(true)} aria-label="Nastavení" title="Nastavení">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.4 7.4 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z"
              />
            </svg>
          </button>
          </div>
        </div>
      </header>
    <main>
      <section className="hero">
        <h1>{HEADINGS[tab]}</h1>
        <p className="sub">
          {tab === "board"
            ? "Zakázky, se kterými pracuješ – přetáhni kartu do dalšího sloupce, jak postupuješ."
            : "AI projde nové veřejné zakázky v celé ČR a vybere ty, kde máš reálnou šanci."}
        </p>
        {tab !== "board" && (
        <div className="sources">
          <span>
            <span className="live" aria-hidden="true" />
            <b>Česko:</b> TED, NEN,{" "}
            {server.profily ? `${server.profily.ok.toLocaleString("cs-CZ")} profilů zadavatelů` : "profily zadavatelů"}, dynamické
            nákupní systémy
          </span>
          {prefs.slovakia && (
            <span>
              <b>Slovensko:</b> TED
            </span>
          )}
          {server.profily && <span className="muted">aktualizováno {new Date(server.profily.updated).toLocaleDateString("cs-CZ")}</span>}
        </div>
        )}
      </section>

      {tab !== "board" && <ProfileForm form={form} setForm={setForm} tab={tab} />}

      {tab === "search" && (
        <SearchTab
          key={synced}
          form={form}
          statuses={statuses}
          marked={marked}
          setStatus={setStatus}
          openDetail={setDetail}
          profily={server.profily?.ok}
          ai={ai}
          onResults={checkResults}
        />
      )}
      {tab === "board" && (
        <BoardTab key={synced} statuses={statuses} marked={marked} changes={kept.changes} setStatus={setStatus} openDetail={setDetail} />
      )}
      {tab === "market" && <MarketTab form={form} slovakia={prefs.slovakia} openCompetitor={setCompetitor} />}
      {tab === "watch" && <WatchTab form={form} server={server} setServer={setServer} />}
      <footer className="foot">
        Zakázky radar <button className="link" onClick={() => setSettings(true)}>v{VERSION}</button>
      </footer>
    </main>
      {settings && (
        <Settings
          close={() => setSettings(false)}
          prefs={prefs}
          setPrefs={savePrefs}
          spent={spent}
          server={server}
        />
      )}
      {detail && (
        <Detail
          t={marked[detail.id] ?? detail}
          profile={form.profile}
          status={statuses[detail.id] ?? "new"}
          setStatus={setStatus}
          kept={kept}
          keep={keep}
          ai={ai}
          openCompetitor={setCompetitor}
          close={() => setDetail(null)}
        />
      )}
      {competitor && <Competitor name={competitor} slovakia={prefs.slovakia} close={() => setCompetitor(null)} />}
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

// na mobilu se celé názvy nevejdou do jednoho řádku
const TAB_SHORT: Record<Tab, string> = { search: "Zakázky", board: "Moje", market: "Trh", watch: "Hlídání" };

const VERSION = process.env.APP_VERSION;

type Theme = "auto" | "light" | "dark";
const THEMES: Record<Theme, string> = { auto: "Podle systému", light: "Světlý", dark: "Tmavý" };

function Settings(props: {
  close: () => void;
  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  spent: number;
  server: ServerState;
}) {
  const { close, prefs, setPrefs, spent, server } = props;
  const [theme, setTheme] = useState<Theme>("auto");
  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as Theme) ?? "auto");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const choose = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
    syncUi("zr-theme", t);
  };
  const pct = Math.min(100, (spent / prefs.budget) * 100);

  return (
    <div className="drawer-bg" onClick={close}>
      <aside className="drawer settings" role="dialog" aria-modal="true" aria-label="Nastavení" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <h2 className="drawer-title">Nastavení</h2>
          <button className="icon" onClick={close} aria-label="Zavřít">
            ×
          </button>
        </div>
        <h3 className="sec">Vzhled</h3>
        <div className="flow">
          {(Object.keys(THEMES) as Theme[]).map((t) => (
            <button key={t} className={theme === t ? "on" : ""} onClick={() => choose(t)}>
              {THEMES[t]}
            </button>
          ))}
        </div>

        <h3 className="sec">Zdroje zakázek</h3>
        <div className="src-group">
          <b>Česká republika</b>
          <span>Vždy zapnuto: TED, NEN, profily zadavatelů (E-ZAK, Tender arena, eGORDION, PROEBIZ, Vhodné uveřejnění a další)</span>
        </div>
        <label className="src-group toggle">
          <input
            type="checkbox"
            checked={prefs.slovakia}
            onChange={(e) => setPrefs({ ...prefs, slovakia: e.target.checked })}
          />
          <span>
            <b>Slovenská republika</b>
            <span>Volitelně: TED (zakázky nad evropským limitem). Platí pro hledání, průzkum trhu i profil konkurenta.</span>
          </span>
        </label>

        <h3 className="sec">AI a útrata</h3>
        <div className="budget">
          <div className="budget-row">
            <b>{usd(spent)}</b>
            <span>
              z {prefs.budget} $ tento měsíc{server.db ? "" : " (v tomto prohlížeči)"}
            </span>
          </div>
          <div className="meter">
            <span style={{ width: `${pct}%`, background: pct >= 100 ? "var(--bad)" : pct >= 80 ? "var(--mid)" : "var(--good)" }} />
          </div>
          {spent >= prefs.budget && (
            <p className="note">Limit je vyčerpaný: nové zakázky se zobrazí bez AI hodnocení, rozbory jsou vypnuté.</p>
          )}
        </div>
        <label>Model pro hodnocení a rozbory</label>
        <div className="flow">
          {(Object.keys(MODEL_LABEL) as Model[]).map((m) => (
            <button key={m} className={prefs.model === m ? "on" : ""} onClick={() => setPrefs({ ...prefs, model: m })}>
              {MODEL_LABEL[m]}
            </button>
          ))}
        </div>
        <label>Měsíční limit</label>
        <select value={prefs.budget} onChange={(e) => setPrefs({ ...prefs, budget: Number(e.target.value) })}>
          {[1, 2, 5, 10, 20].map((b) => (
            <option key={b} value={b}>
              {b} $
            </option>
          ))}
        </select>
        <p className="note">
          Limit hlídá appka. Pevný strop nastav i v console.anthropic.com → Settings → Limits, ten platí vždy.
        </p>

        <h3 className="sec">Připojení</h3>
        <Check ok={server.ai} label="AI hodnocení (ANTHROPIC_API_KEY)" />
        <Check ok={server.db} label="Databáze – stejná data na všech zařízeních (Upstash)" />
        <Check ok={server.email && server.cron} label="Ranní e-mail (RESEND_API_KEY, ALERT_EMAIL, CRON_SECRET)" />

        <h3 className="sec">O aplikaci</h3>
        <p className="note">
          Zakázky radar, verze <b>{VERSION}</b>
        </p>
        <button
          className="ghost logout"
          onClick={() => fetch("/api/logout", { method: "POST" }).finally(() => location.replace("/login"))}
        >
          Odhlásit toto zařízení
        </button>
      </aside>
    </div>
  );
}

const HEADINGS: Record<Tab, string> = {
  search: "Zakázky, které sedí na tvou nabídku",
  board: "Moje zakázky",
  market: "Průzkum trhu",
  watch: "Hlídání e-mailem",
};

const PRESET_ICON: Record<string, IconName> = {
  "CRM a zákaznické portály": "users",
  "Vzdělávací portál": "cap",
  "Kybernetická bezpečnost": "shield",
};

const PRESET_HINT: Record<string, string> = {
  "CRM a zákaznické portály": "Malé CRM, klientské a občanské portály, helpdesk",
  "Vzdělávací portál": "E-learning, LMS, povinná školení zaměstnanců",
  "Kybernetická bezpečnost": "GAP analýza NIS2, SIEM a SOC, endpoint a antivirus",
};

type Form = (typeof PRESETS)[number] & { days: number; minScore: number };

function ProfileForm({ form, setForm, tab }: { form: Form; setForm: (f: Form) => void; tab: Tab }) {
  return (
    <div className="card">
      <div className="step">Co hledáš</div>
      <div className="presets">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className={`preset ${form.name === p.name ? "on" : ""}`}
            onClick={() => setForm({ ...form, ...p })}
            aria-pressed={form.name === p.name}
          >
            <span className="preset-ic">
              <Icon n={PRESET_ICON[p.name] ?? "search"} size={20} />
            </span>
            <span className="preset-text">
              <b>{p.name}</b>
              <span>{PRESET_HINT[p.name] ?? p.keywords}</span>
            </span>
            <span className="preset-check">
              <Icon n="check" size={14} />
            </span>
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

const regionLabel = (x: string) =>
  x === "Praha" ? "Praha" : x === "Vysočina" ? "Kraj Vysočina" : x === "celostátní" ? "Celostátní" : x === "neznámý" ? "Kraj neznámý" : `${x} kraj`;

// filtr hodnoty; zakázky bez uvedené hodnoty ukazujeme vždy, dokud není vybráno „jen s hodnotou“
type ValueRange = "all" | "s" | "m" | "l" | "xl";
const VALUES: Record<ValueRange, { label: string; test: (v: number | null) => boolean }> = {
  all: { label: "Jakákoli hodnota", test: () => true },
  s: { label: "do 500 tis. Kč", test: (v) => !v || v <= 500_000 },
  m: { label: "do 2 mil. Kč", test: (v) => !v || v <= 2_000_000 },
  l: { label: "do 5 mil. Kč", test: (v) => !v || v <= 5_000_000 },
  xl: { label: "nad 5 mil. Kč", test: (v) => !!v && v > 5_000_000 },
};

function SearchTab(props: {
  form: Form;
  statuses: Record<string, Status>;
  marked: Record<string, ScoredTender>;
  setStatus: (t: ScoredTender, s: Status) => void;
  openDetail: (t: ScoredTender) => void;
  profily?: number;
  ai: Ai;
  onResults: (results: ScoredTender[]) => void;
}) {
  const { form, statuses, marked, setStatus, openDetail, profily, ai, onResults } = props;
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [stats, setStats] = useState<{ total: number; open: number; scored: number; cached: number; cost: number } | null>(null);
  const [results, setResults] = useState<ScoredTender[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [sort, setSort] = useState<Sort>("score");
  const [region, setRegion] = useState("all");
  const [value, setValue] = useState<ValueRange>("all");
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    setResults(load("zr-results", []));
    setFresh(new Set(load<string[]>("zr-fresh", [])));
    setSort(load("zr-sort", "score"));
    setRegion(load("zr-region", "all"));
    setValue(load("zr-value", "all"));
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
      const known = loadScores(form.profile);
      const data = await Promise.all(
        (["open", "upcoming"] as const).map(async (mode) => {
          const res = await post("/api/search", { ...form, mode, known, model: ai.model, noAi: ai.noAi, slovakia: ai.slovakia }, ctrl.signal);
          const d = await res.json();
          if (!res.ok) throw new Error(d.error ?? `Chyba ${res.status}`);
          return d as {
            total: number;
            open: number;
            scored: number;
            cached: number;
            cost: number;
            newScores: Record<string, Score>;
            warnings?: string[];
            results: ScoredTender[];
          };
        }),
      );
      saveScores(form.profile, Object.assign({}, ...data.map((d) => d.newScores)));
      const all = data.flatMap((d) => d.results).sort((a, b) => b.score - a.score);
      // co přibylo od minulého hledání
      const before = new Set(load<ScoredTender[]>("zr-results", []).map((r) => r.id));
      const added = before.size ? all.filter((r) => !before.has(r.id)).map((r) => r.id) : [];
      setFresh(new Set(added));
      setWarnings([...new Set(data.flatMap((d) => d.warnings ?? []))]);
      const sum = (k: "total" | "open" | "scored" | "cached" | "cost") => data[0][k] + data[1][k];
      setStats({ total: sum("total"), open: sum("open"), scored: sum("scored"), cached: sum("cached"), cost: sum("cost") });
      ai.onCost(sum("cost"));
      setResults(all);
      onResults(all);
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
    .filter((r) => region === "all" || r.region === region || (region === "neznámý" && !r.region))
    .filter((r) => VALUES[value].test(r.value))
    .filter((r) => !q || norm(`${r.title} ${r.buyer} ${r.product} ${r.reason}`).includes(q))
    .sort(CMP[sort]);
  const count = (s: Status) => Object.values(statuses).filter((x) => x === s).length;
  const sources = [...new Set(results.map((r) => r.source))];
  const narrowed = Boolean(q) || source !== "all" || region !== "all" || value !== "all";
  const regions = REGIONS.filter((x) => results.some((r) => (r.region ?? "neznámý") === x));

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
              AI hodnotí jen zakázky, které ještě neviděla, obvykle do minuty. {Math.floor(elapsed / 60)}:
              {String(elapsed % 60).padStart(2, "0")}
            </span>
          </div>
          <button onClick={() => abort.current?.abort()}>Zrušit</button>
        </div>
      ) : (
        <button className="primary big" onClick={search}>
          <Icon n="search" size={18} />
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
            <button key={t.id} className="mine-row" onClick={() => openDetail(t)}>
              <span>{t.title}</span>
              <Deadline d={t.deadline} short />
            </button>
          ))}
        </div>
      )}

      {stats && !loading && (
        <div className="summary">
          <div>
            <b>{stats.open.toLocaleString("cs-CZ")}</b>
            <span>aktuálních zakázek prošlo</span>
          </div>
          <div className="hl">
            <b>{results.length}</b>
            <span>vhodných pro tebe</span>
          </div>
          <div className={fresh.size ? "new" : ""}>
            <b>{fresh.size}</b>
            <span>nových od minula</span>
          </div>
          <div>
            <b>{usd(stats.cost)}</b>
            <span>
              {stats.cached > 0 ? `za AI, ${stats.cached.toLocaleString("cs-CZ")} skóre z paměti` : "útrata za AI"}
            </span>
          </div>
        </div>
      )}
      {(results.length > 0 || Object.keys(statuses).length > 0) && !loading && (
        <div className="filterbar">
          <div className="filterbar-top">
            <div className="filters">
              {(["all", "maybe", "bid", "no"] as const).map((f) => (
                <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                  {f === "all" ? "Vše" : STATUS_LABEL[f]}
                  {f !== "all" && count(f) > 0 && <span className="count">{count(f)}</span>}
                </button>
              ))}
            </div>
            <button className="ghost" onClick={() => exportCsv(shown)} disabled={!shown.length} title="Stáhnout zobrazené zakázky pro Excel">
              <Icon n="download" /> Excel
            </button>
          </div>
          <div className="toolbar">
            <input
              type="search"
              className="find"
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
            {regions.length > 1 && (
              <select
                value={region}
                onChange={(e) => {
                  setRegion(e.target.value);
                  save("zr-region", e.target.value);
                }}
                aria-label="Kraj"
              >
                <option value="all">Všechny kraje</option>
                {regions.map((x) => (
                  <option key={x} value={x}>
                    {regionLabel(x)} (
                    {results.filter((r) => (r.region ?? "neznámý") === x).length})
                  </option>
                ))}
              </select>
            )}
            <select
              value={value}
              onChange={(e) => {
                setValue(e.target.value as ValueRange);
                save("zr-value", e.target.value);
              }}
              aria-label="Hodnota"
            >
              {(Object.keys(VALUES) as ValueRange[]).map((v) => (
                <option key={v} value={v}>
                  {VALUES[v].label}
                </option>
              ))}
            </select>
            <select value={sort} onChange={(e) => changeSort(e.target.value as Sort)}>
              {(Object.keys(SORTS) as Sort[]).map((s) => (
                <option key={s} value={s}>
                  {SORTS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="list">
        {loading && [0, 1, 2].map((i) => <div key={i} className="card skeleton" />)}
        {!loading &&
          shown.map((t) => (
            <TenderCard
              key={t.id}
              t={t}
              fresh={fresh.has(t.id)}
              status={statuses[t.id] ?? "new"}
              setStatus={setStatus}
              openDetail={openDetail}
            />
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
                    setRegion("all");
                    setValue("all");
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
                <span className="empty-ic">
                  <Icon n="radar" size={28} />
                </span>
                <b>Zatím nic</b>
                <span>Vyber, co hledáš, a klikni na Najít zakázky. Hledání trvá asi minutu.</span>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

const daysLeft = (d: string | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400_000) : null);

function Deadline({ d, short, icon }: { d: string | null; short?: boolean; icon?: boolean }) {
  const left = daysLeft(d);
  if (left === null)
    return (
      <span className="deadline none">
        {icon && <Icon n="clock" size={14} />}
        lhůta neuvedena
      </span>
    );
  return (
    <span className={`deadline ${left <= 3 ? "urgent" : left <= 7 ? "soon" : ""}`}>
      {icon && <Icon n="clock" size={14} />}
      {left <= 0 ? "končí dnes" : `${short ? "" : "lhůta "}za ${left} ${left === 1 ? "den" : left < 5 ? "dny" : "dní"}`}
      <small>{new Date(d!).toLocaleDateString("cs-CZ")}</small>
    </span>
  );
}

function TenderCard(props: {
  t: ScoredTender;
  fresh: boolean;
  status: Status;
  setStatus: (t: ScoredTender, s: Status) => void;
  openDetail: (t: ScoredTender) => void;
}) {
  const { t, fresh, status, setStatus, openDetail } = props;
  return (
    <article
      className={`card tender ${status === "no" ? "dim" : ""} ${status !== "new" ? `is-${status}` : ""}`}
      onClick={() => openDetail(t)}
    >
      <div className="score-col">
        <div className="score" style={{ "--c": scoreColor(t.score), "--p": Math.max(t.score, 0) } as React.CSSProperties}>
          <span>{t.score < 0 ? "–" : t.score}</span>
        </div>
        <small style={{ color: scoreColor(t.score) }}>{scoreLabel(t.score)}</small>
      </div>
      <div className="tender-body">
        <div className="tender-top">
          <div className="tags">
            {fresh && <span className="tag fresh">nová</span>}
            {t.kind === "upcoming" && <span className="tag soon">připravovaná</span>}
            {t.country === "SK" && <span className="tag sk">SK</span>}
            {["sent", "won", "lost"].includes(status) && <span className={`tag st-${status}`}>{STATUS_LABEL[status]}</span>}
            {t.product && t.product !== "–" && <span className="tag accent">{t.product}</span>}
          </div>
          {t.source === "DNS" ? (
            <span className="deadline open">
              <Icon n="clock" size={14} />
              přidat se lze kdykoli
            </span>
          ) : (
            <Deadline d={t.deadline} icon />
          )}
        </div>
        <h3>
          <button className="title" onClick={() => openDetail(t)}>
            {t.title || "(bez názvu)"}
          </button>
        </h3>
        <div className="meta">
          <span>
            <Icon n="building" size={14} />
            {t.buyer}
          </span>
          {t.value ? (
            <span>
              <Icon n="money" size={14} />
              {money(t.value, t.currency)}
            </span>
          ) : null}
          {t.region && t.region !== "neznámý" && (
            <span>
              <Icon n="pin" size={14} />
              {regionLabel(t.region)}
            </span>
          )}
          <span className="src">{t.source === "DNS" ? "dynamický nákupní systém" : t.source}</span>
        </div>
        {t.reason && (
          <p className="reason">
            <Icon n="sparkle" size={14} />
            <span>{t.reason}</span>
          </p>
        )}
        <div className="tender-foot" onClick={(e) => e.stopPropagation()}>
          <button className="link more-link" onClick={() => openDetail(t)}>
            Detail a AI rozbor <Icon n="arrow" size={14} />
          </button>
          <div className="actions" role="group" aria-label="Co s zakázkou">
            {ACTIONS.map(({ s, label, icon }) => (
              <button
                key={s}
                className={`${s} ${status === s ? "on" : ""}`}
                onClick={() => setStatus(t, status === s ? "new" : s)}
                aria-pressed={status === s}
              >
                <Icon n={icon} size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

const CHANGE_LABEL: Record<Change["field"], string> = { deadline: "Lhůta", title: "Název", value: "Hodnota", description: "Popis" };

const changeValue = (c: Change, v: string) =>
  c.field === "deadline" && /^\d{4}-\d\d-\d\d/.test(v)
    ? new Date(v).toLocaleDateString("cs-CZ")
    : c.field === "value" && Number(v)
      ? money(Number(v))
      : v;

const VERDICT: Record<Analysis["verdict"], { label: string; cls: string }> = {
  go: { label: "Podat nabídku", cls: "good" },
  consider: { label: "Zvážit", cls: "mid" },
  skip: { label: "Nechat být", cls: "bad" },
};
// pořadí stavů v detailu i na nástěnce
const FLOW: Status[] = ["maybe", "bid", "sent", "won", "lost", "no"];

function Detail(props: {
  t: ScoredTender;
  profile: string;
  status: Status;
  setStatus: (t: ScoredTender, s: Status) => void;
  kept: Kept;
  keep: Keep;
  ai: Ai;
  openCompetitor: (name: string) => void;
  close: () => void;
}) {
  const { t, profile, status, setStatus, kept, keep, ai, openCompetitor, close } = props;
  const analysis = kept.analysis[t.id] ?? null;
  const draft = kept.drafts[t.id] ?? null;
  const changes = kept.changes[t.id] ?? [];
  const [busy, setBusy] = useState<"analysis" | "draft" | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [similar, setSimilar] = useState<Market | null>(null);
  const [simBusy, setSimBusy] = useState(false);

  useEffect(() => {
    setNote(kept.notes[t.id] ?? "");
    setSimilar(null);
    setError("");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [t.id]);

  // poznámka se uloží až po chvíli bez psaní, ať se databáze nevolá po každém písmenu
  useEffect(() => {
    if (note === (kept.notes[t.id] ?? "")) return;
    const id = setTimeout(() => keep("notes", t.id, note.trim() ? note : null), 700);
    return () => clearTimeout(id);
  }, [note]);

  async function runAi(kind: "analysis" | "draft") {
    setBusy(kind);
    setError("");
    try {
      const res = await post("/api/analyze", { kind, profile, tender: t, analysis, model: ai.model });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `Chyba ${res.status}`);
      ai.onCost(d.cost ?? 0);
      if (kind === "draft") keep("drafts", t.id, d.data);
      else keep("analysis", t.id, d.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }
  const analyze = () => runAi("analysis");

  const draftText = (d: Draft) =>
    [
      `Osnova nabídky: ${t.title}`,
      ...d.outline.flatMap((o, i) => [``, `${i + 1}. ${o.heading}`, ...o.points.map((p) => `   - ${p}`)]),
      ``,
      `Průvodní dopis`,
      ``,
      d.coverLetter,
    ].join("\n");

  async function loadSimilar() {
    setSimBusy(true);
    try {
      const res = await post("/api/market", { cpv: t.cpv.slice(0, 4).join(" "), keywords: "", days: 1095 });
      const d = await res.json();
      if (res.ok) setSimilar(d);
      else setError(d.error);
    } finally {
      setSimBusy(false);
    }
  }

  return (
    <div className="drawer-bg" onClick={close}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={t.title} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="tags">
            <span className="tag">{t.source}</span>
            {t.kind === "upcoming" && <span className="tag soon">připravovaná</span>}
            {t.product && t.product !== "–" && <span className="tag accent">{t.product}</span>}
          </div>
          <button className="icon" onClick={close} aria-label="Zavřít">
            ×
          </button>
        </div>
        <h2 className="drawer-title">{t.title || "(bez názvu)"}</h2>
        <p className="drawer-buyer">{t.buyer}</p>

        <dl className="facts">
          <div>
            <dt>Lhůta</dt>
            <dd>
              <Deadline d={t.deadline} short />
            </dd>
          </div>
          <div>
            <dt>Hodnota</dt>
            <dd>{money(t.value, t.currency)}</dd>
          </div>
          <div>
            <dt>Zveřejněno</dt>
            <dd>{t.published ? new Date(t.published).toLocaleDateString("cs-CZ") : "neuvedeno"}</dd>
          </div>
          <div>
            <dt>AI skóre</dt>
            <dd style={{ color: scoreColor(t.score) }}>
              {t.score < 0 ? "–" : `${t.score} – ${scoreLabel(t.score)}`}
            </dd>
          </div>
        </dl>
        {t.reason && <p className="reason">{t.reason}</p>}

        {changes.length > 0 && (
          <div className="changes">
            <div className="mine-head">
              <b>Změny od uložení</b>
              <button className="link" onClick={() => keep("changes", t.id, null)}>
                Beru na vědomí
              </button>
            </div>
            {changes.map((c, i) => (
              <div key={i} className="change">
                <span>{new Date(c.at).toLocaleDateString("cs-CZ")}</span>
                <span>
                  {CHANGE_LABEL[c.field]}: <s>{changeValue(c, c.from) || "–"}</s> → <b>{changeValue(c, c.to)}</b>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="drawer-links">
          <a className="btn" href={t.url} target="_blank" rel="noreferrer">
            Otevřít zakázku ↗
          </a>
          {t.deadline && <button onClick={() => exportIcs(t)}>Lhůta do kalendáře</button>}
        </div>

        <h3 className="sec">Stav</h3>
        <div className="flow">
          {FLOW.map((s) => (
            <button key={s} className={`${s} ${status === s ? "on" : ""}`} onClick={() => setStatus(t, status === s ? "new" : s)}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <h3 className="sec">AI rozbor</h3>
        {!analysis && busy !== "analysis" && (
          <div className="ai-cta">
            <span>
              {ai.noAi
                ? "Měsíční limit za AI je vyčerpaný, změníš ho v Nastavení."
                : "Přečte stránku zakázky a řekne, co chtějí, jaké mají podmínky, rizika a co nabídnout."}
            </span>
            <button className="primary" onClick={analyze} disabled={ai.noAi || busy !== null}>
              Udělat rozbor
            </button>
          </div>
        )}
        {busy === "analysis" && (
          <div className="ai-cta">
            <div className="radar" aria-hidden="true" />
            <span>Čtu zakázku a připravuji rozbor, asi 30 vteřin…</span>
          </div>
        )}
        {error && <div className="warn">{error}</div>}
        {analysis && (
          <div className="analysis">
            <div className={`verdict ${VERDICT[analysis.verdict].cls}`}>
              <b>{VERDICT[analysis.verdict].label}</b>
              <span>{analysis.verdictReason}</span>
            </div>
            <p>{analysis.summary}</p>
            <AnalysisList title="Podmínky a kvalifikace" items={analysis.requirements} />
            <AnalysisList title="Rizika" items={analysis.risks} />
            <h4>Co nabídnout</h4>
            <p>{analysis.offer}</p>
            <AnalysisList title="Na co se zeptat zadavatele" items={analysis.questions} />
            {busy !== "analysis" && !ai.noAi && (
              <button className="link" onClick={analyze}>
                Udělat rozbor znovu
              </button>
            )}
          </div>
        )}

        <h3 className="sec">Návrh nabídky</h3>
        {!draft && busy !== "draft" && (
          <div className="ai-cta">
            <span>Osnova nabídky na míru této zakázce a průvodní dopis. Použije i rozbor, pokud je hotový.</span>
            <button className="primary" onClick={() => runAi("draft")} disabled={ai.noAi || busy !== null}>
              Navrhnout
            </button>
          </div>
        )}
        {busy === "draft" && (
          <div className="ai-cta">
            <div className="radar" aria-hidden="true" />
            <span>Píšu osnovu a dopis, asi 30 vteřin…</span>
          </div>
        )}
        {draft && (
          <div className="analysis">
            <ol className="outline">
              {draft.outline.map((o) => (
                <li key={o.heading}>
                  <b>{o.heading}</b>
                  <ul>
                    {o.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            <h4>Průvodní dopis</h4>
            <p className="letter">{draft.coverLetter}</p>
            <div className="drawer-links">
              <button
                onClick={() =>
                  navigator.clipboard.writeText(draftText(draft)).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  })
                }
              >
                {copied ? "Zkopírováno" : "Kopírovat celé"}
              </button>
              {busy !== "draft" && !ai.noAi && (
                <button className="link" onClick={() => runAi("draft")}>
                  Navrhnout znovu
                </button>
              )}
            </div>
          </div>
        )}

        {t.description && (
          <>
            <h3 className="sec">Popis zakázky</h3>
            <p className="desc">{t.description}</p>
          </>
        )}

        <h3 className="sec">Poznámky</h3>
        <textarea
          className="notes"
          placeholder="Kontakt na zadavatele, cena, kdo pomůže s nabídkou…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <h3 className="sec">Ceny podobných zakázek</h3>
        {!similar ? (
          <button onClick={loadSimilar} disabled={simBusy || !t.cpv.length}>
            {simBusy ? "Načítám…" : t.cpv.length ? "Kdo a za kolik vyhrál podobné (3 roky)" : "Zakázka nemá CPV kódy"}
          </button>
        ) : (
          <div className="similar">
            <p>
              {similar.count} zadaných zakázek se stejnými CPV
              {similar.prices.median ? (
                <>
                  , medián <b>{money(similar.prices.median)}</b>
                  {similar.prices.p25 && <>, běžně {money(similar.prices.p25, "")}– {money(similar.prices.p75)}</>}
                </>
              ) : null}
              .
            </p>
            {similar.topWinners.slice(0, 5).map((w) => (
              <button key={w.name} className="mine-row" onClick={() => openCompetitor(w.name)} title="Profil konkurenta">
                <span>{w.name}</span>
                <span className="note">{w.wins}× výhra</span>
              </button>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <>
      <h4>{title}</h4>
      <ul>
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </>
  );
}

const COLUMNS: { s: Status | "top"; label: string }[] = [
  { s: "top", label: "Nové tipy" },
  { s: "maybe", label: "Zvažuji" },
  { s: "bid", label: "Připravuji" },
  { s: "sent", label: "Podáno" },
  { s: "won", label: "Vyhráno" },
  { s: "lost", label: "Nevyšlo" },
];

function BoardTab(props: {
  statuses: Record<string, Status>;
  marked: Record<string, ScoredTender>;
  changes: Record<string, Change[]>;
  setStatus: (t: ScoredTender, s: Status) => void;
  openDetail: (t: ScoredTender) => void;
}) {
  const { statuses, marked, changes, setStatus, openDetail } = props;
  const [results, setResults] = useState<ScoredTender[]>([]);
  const [over, setOver] = useState<string | null>(null);
  useEffect(() => setResults(load("zr-results", [])), []);

  const all = new Map([...results, ...Object.values(marked)].map((t) => [t.id, t]));
  const items = (s: Status | "top") =>
    s === "top"
      ? results.filter((t) => !statuses[t.id] && t.score >= 60 && (!t.deadline || t.deadline >= today())).slice(0, 8)
      : [...all.values()].filter((t) => statuses[t.id] === s).sort(CMP.deadline);
  const move = (id: string, s: Status | "top") => {
    const t = all.get(id);
    if (t) setStatus(t, s === "top" ? "new" : s);
  };

  return (
    <>
      <Report results={results} statuses={statuses} all={all} openDetail={openDetail} />
      <h2 className="no-print">Nástěnka</h2>
      <div className="board no-print">
        {COLUMNS.map((c) => {
          const list = items(c.s);
          return (
            <section
              key={c.s}
              className={`col col-${c.s} ${over === c.s ? "over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(c.s);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                move(e.dataTransfer.getData("text/plain"), c.s);
              }}
            >
              <header>
                <b>
                  <i className="dot" aria-hidden="true" />
                  {c.label}
                </b>
                <span className="count">{list.length}</span>
              </header>
              {list.map((t) => (
                <div
                  key={t.id}
                  className="bcard"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                >
                  {changes[t.id]?.length ? (
                    <span className="tag changed">
                      změna: {[...new Set(changes[t.id].map((c) => CHANGE_LABEL[c.field].toLowerCase()))].join(", ")}
                    </span>
                  ) : null}
                  <button className="title" onClick={() => openDetail(t)}>
                    {t.title || "(bez názvu)"}
                  </button>
                  <span className="bcard-buyer">{t.buyer}</span>
                  <div className="bcard-foot">
                    <Deadline d={t.deadline} short />
                    <select
                      aria-label="Přesunout do"
                      value={c.s}
                      onChange={(e) => move(t.id, e.target.value as Status | "top")}
                    >
                      {COLUMNS.map((o) => (
                        <option key={o.s} value={o.s}>
                          {o.s !== "top" ? o.label : c.s === "top" ? "Přesunout do…" : "Vrátit mezi nové"}
                        </option>
                      ))}
                      <option value="no">Skrýt</option>
                    </select>
                  </div>
                </div>
              ))}
              {!list.length && (
                <p className="col-empty">{c.s === "top" ? "Spusť hledání v záložce Zakázky." : "Přetáhni sem kartu."}</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function Report(props: {
  results: ScoredTender[];
  statuses: Record<string, Status>;
  all: Map<string, ScoredTender>;
  openDetail: (t: ScoredTender) => void;
}) {
  const { results, statuses, all, openDetail } = props;
  const [copied, setCopied] = useState(false);
  const week = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  const withStatus = (s: Status) => [...all.values()].filter((t) => statuses[t.id] === s);

  const fresh = results.filter((t) => t.score >= 50 && (t.published ?? "") >= week).length;
  const n = Object.fromEntries(FLOW.map((s) => [s, withStatus(s).length])) as Record<Status, number>;
  const pipeline = [...withStatus("bid"), ...withStatus("sent")]
    .filter((t) => t.value && (t.currency ?? "CZK") === "CZK")
    .reduce((a, t) => a + t.value!, 0);
  const decided = n.won + n.lost;
  const deadlines = [...withStatus("maybe"), ...withStatus("bid")]
    .filter((t) => t.deadline && t.deadline >= today() && t.deadline <= in14)
    .sort(CMP.deadline);

  const kpis: [string, string][] = [
    [String(fresh), "nových vhodných za 7 dní"],
    [String(n.maybe), "zvažuješ"],
    [String(n.bid), "připravuješ"],
    [String(n.sent), "podáno, čeká na výsledek"],
    [pipeline ? moneyShort(pipeline) : "–", "hodnota rozpracovaných"],
    [decided ? `${Math.round((n.won / decided) * 100)} %` : "–", `úspěšnost (${n.won} z ${decided})`],
  ];

  const copy = () => {
    const text = [
      `Zakázky radar – přehled ${new Date().toLocaleDateString("cs-CZ")}`,
      ...kpis.map(([v, l]) => `${l}: ${v}`),
      "",
      "Lhůty v příštích 14 dnech:",
      ...(deadlines.length
        ? deadlines.map((t) => `- ${new Date(t.deadline!).toLocaleDateString("cs-CZ")} ${t.title} (${t.buyer}), ${STATUS_LABEL[statuses[t.id]]}`)
        : ["- žádné"]),
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <section className="report">
      <div className="report-head">
        <h2>Přehled</h2>
        <div className="report-actions no-print">
          <button onClick={copy}>{copied ? "Zkopírováno" : "Kopírovat jako text"}</button>
          <button onClick={() => window.print()}>Tisk / PDF</button>
        </div>
      </div>
      <div className="kpis">
        {kpis.map(([v, l]) => (
          <div key={l} className="card kpi">
            <div className="kpi-v">{v}</div>
            <div className="kpi-l">{l}</div>
          </div>
        ))}
      </div>
      <div className="card mine">
        <div className="mine-head">
          <b>Lhůty v příštích 14 dnech</b>
        </div>
        {deadlines.length ? (
          deadlines.map((t) => (
            <button key={t.id} className="mine-row" onClick={() => openDetail(t)}>
              <span>{t.title}</span>
              <Deadline d={t.deadline} short />
            </button>
          ))
        ) : (
          <p className="note">Žádná zvažovaná ani připravovaná zakázka nekončí v příštích 14 dnech.</p>
        )}
      </div>
    </section>
  );
}

type Market = {
  count: number;
  isvz: { months: string[]; count: number } | null;
  smlouvy: { count: number } | null;
  offers: { avg: number; single: number; count: number } | null;
  prices: { count: number; p25: number | null; median: number | null; p75: number | null; min: number | null; max: number | null };
  topWinners: { name: string; wins: number; total: number }[];
  awards: Award[];
};

function MarketTab(props: { form: Form; slovakia: boolean; openCompetitor: (name: string) => void }) {
  const { form, slovakia, openCompetitor } = props;
  const [days, setDays] = useState(730);
  const [useKeywords, setUseKeywords] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Market | null>(null);

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await post("/api/market", { cpv: form.cpv, keywords: useKeywords ? form.keywords : "", days, slovakia });
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
      <p className="note lead">
        Kdo a za kolik vyhrál podobné zakázky: výsledky řízení z otevřených dat ISVZ (i malé zakázky, cena smlouvy, počet
        nabídek), z TED a smlouvy z Registru smluv (i bez soutěže). Ukáže reálné ceny a konkurenci.
      </p>
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
            {data.offers && (
              <div className="card kpi">
                <div className="kpi-v">{data.offers.avg.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })}</div>
                <div className="kpi-l">
                  nabídek průměrně, v {Math.round(data.offers.single * 100)} % jen jedna
                </div>
              </div>
            )}
          </div>
          {data.isvz && data.isvz.months.length > 0 && (
            <p className="note">
              ISVZ: {data.isvz.count.toLocaleString("cs-CZ")} smluv z IT, softwaru a vzdělávání, {data.isvz.months[0]} až{" "}
              {data.isvz.months.at(-1)}
              {data.smlouvy ? `, Registr smluv: ${data.smlouvy.count.toLocaleString("cs-CZ")} smluv z IT` : ""}. Ceny jsou bez DPH.
            </p>
          )}

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
                      <button className="link name" onClick={() => openCompetitor(w.name)} title="Profil konkurenta">
                        {w.name}
                      </button>
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
                  <span>{a.published ? new Date(a.published).toLocaleDateString("cs-CZ") : ""}</span>
                  {typeof a.offers === "number" && a.offers > 0 && (
                    <span>
                      {a.offers} {a.offers === 1 ? "nabídka" : a.offers < 5 ? "nabídky" : "nabídek"}
                    </span>
                  )}
                  {a.source && <span className="tag">{a.source}</span>}
                </div>
                <p className="reason">
                  Vyhrál:{" "}
                  {a.winners.length
                    ? a.winners.map((w, i) => (
                        <span key={w}>
                          {i > 0 && ", "}
                          <button className="link name" onClick={() => openCompetitor(w)}>
                            {w}
                          </button>
                        </span>
                      ))
                    : "neuvedeno"}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

type CompetitorData = {
  name: string;
  count: number;
  total: number;
  topBuyers: { buyer: string; wins: number }[];
  byYear: { year: string; wins: number }[];
  awards: Award[];
};

function Competitor({ name, slovakia, close }: { name: string; slovakia: boolean; close: () => void }) {
  const [data, setData] = useState<CompetitorData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    post("/api/competitor", { name, slovakia })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [name]);

  const maxYear = Math.max(1, ...(data?.byYear ?? []).map((y) => y.wins));
  return (
    <div className="drawer-bg" onClick={close}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={name} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="tag">Profil konkurenta</span>
          <button className="icon" onClick={close} aria-label="Zavřít">
            ×
          </button>
        </div>
        <h2 className="drawer-title">{name}</h2>
        <p className="drawer-buyer">
          Výhry a smlouvy: ISVZ a Registr smluv (české zakázky a smlouvy z IT) a TED (
          {slovakia ? "Česko a Slovensko" : "Česko"}, nad evropským limitem)
        </p>
        {error && <div className="warn">{error}</div>}
        {!data && !error && (
          <div className="ai-cta">
            <div className="radar" aria-hidden="true" />
            <span>Hledám výhry v TED…</span>
          </div>
        )}
        {data && (
          <>
            <dl className="facts">
              <div>
                <dt>Vyhraných zakázek</dt>
                <dd>{data.count}</dd>
              </div>
              <div>
                <dt>Objem (podíl, Kč)</dt>
                <dd>{data.total ? moneyShort(data.total) : "–"}</dd>
              </div>
              <div>
                <dt>Zadavatelů</dt>
                <dd>{new Set(data.awards.map((a) => a.buyer)).size}</dd>
              </div>
            </dl>
            {data.byYear.length > 0 && (
              <>
                <h3 className="sec">Výhry po letech</h3>
                <div className="years">
                  {data.byYear.map((y) => (
                    <div key={y.year} className="year">
                      <span className="year-bar" style={{ height: `${(y.wins / maxYear) * 100}%` }} title={`${y.wins}×`} />
                      <small>
                        {y.year}
                        <br />
                        {y.wins}×
                      </small>
                    </div>
                  ))}
                </div>
              </>
            )}
            {data.topBuyers.length > 0 && (
              <>
                <h3 className="sec">Pro koho nejčastěji</h3>
                {data.topBuyers.map((b) => (
                  <div key={b.buyer} className="mine-row">
                    <span>{b.buyer}</span>
                    <span className="note">{b.wins}×</span>
                  </div>
                ))}
              </>
            )}
            <h3 className="sec">Poslední výhry</h3>
            {data.awards.length ? (
              data.awards.slice(0, 20).map((a) => (
                <a key={a.id} className="mine-row" href={a.url} target="_blank" rel="noreferrer">
                  <span>{a.title}</span>
                  <span className="note">{a.value ? moneyShort(a.value) : a.published}</span>
                </a>
              ))
            ) : (
              <p className="note">Žádná výhra ani smlouva. Zakázky malého rozsahu se do registrů hlásí jen zčásti.</p>
            )}
          </>
        )}
      </aside>
    </div>
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
