"use client";

import { createContext, Fragment, useContext, useEffect, useRef, useState } from "react";
import { makeDocx, type Block } from "@/lib/docx";
import qrcode from "qrcode-generator";
import { MB_LOGO } from "@/lib/logo";
import { combine, JOIN, PRESET_SHORT, PRESETS, selectedPresets } from "@/lib/presets";
import { diff } from "@/lib/diff";
import { profileKey } from "@/lib/profile-key";
import { REGIONS } from "@/lib/regions";
import type { Analysis, Award, BuyerAi, BuyerHistory, Change, Checks, Contract, Draft, Outcome, Score, ScoredTender, Status, WatchedProfile } from "@/lib/types";

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
  home: "M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
};
type IconName = keyof typeof ICONS;
function Icon({ n, size = 16 }: { n: IconName; size?: number }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={ICONS[n]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Tab = "today" | "search" | "board" | "market" | "watch";
const TABS: Record<Tab, string> = {
  today: "Dnes",
  search: "Zakázky",
  board: "Moje zakázky",
  market: "Průzkum trhu",
  watch: "Hlídání",
};
const TAB_ICON: Record<Tab, IconName> = { today: "home", search: "search", board: "board", market: "chart", watch: "bell" };

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
  calendar?: string | null;
  user?: string;
  multi?: boolean;
  owner?: boolean;
  access?: Access; // co smí tento účet hledat (nastavuje vlastník)
};
type Access = { presets: string[] | null; edit: boolean };
type Buyers = { buyers: { name: string; ico: string | null; added: string }[]; tenders: ScoredTender[] };

// poznámky, AI rozbory, návrhy nabídek a změny – v databázi, bez ní v prohlížeči
type Kept = {
  notes: Record<string, string>;
  analysis: Record<string, Analysis>;
  drafts: Record<string, Draft>;
  changes: Record<string, Change[]>;
  history: Record<string, BuyerAi>;
  checks: Record<string, Checks>;
  results: Record<string, Outcome>;
};
type KeptKind = keyof Kept;
const EMPTY_KEPT: Kept = { notes: {}, analysis: {}, drafts: {}, changes: {}, history: {}, checks: {}, results: {} };
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
const SYNCED = ["zr-results", "zr-fresh", "zr-form", "zr-prefs", "zr-sort", "zr-region", "zr-value", "zr-theme", "zr-visit"];
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
  const [tab, setTab] = useState<Tab>("today");
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
  // sledovaní zadavatelé a jejich otevřené zakázky
  const [buyers, setBuyers] = useState<Buyers>({ buyers: [], tenders: [] });
  const loadBuyers = () =>
    fetch("/api/buyers")
      .then((r) => r.json())
      .then((d) => d.buyers && setBuyers(d))
      .catch(() => {});
  useEffect(() => {
    loadBuyers();
  }, []);
  const toggleBuyer = async (name: string) => {
    const watched = buyers.buyers.some((b) => b.name === name);
    const res = await post("/api/buyers", watched ? { remove: name } : { add: name });
    const d = await res.json();
    if (!res.ok) return setToast({ text: d.error ?? "Nepodařilo se uložit" });
    setToast({ text: watched ? `Už nesleduješ ${name}` : `Sleduješ ${name} – dám vědět o každé nové zakázce` });
    loadBuyers();
  };

  // sledovaní konkurenti
  const [competitors, setCompetitors] = useState<{ name: string; added: string }[]>([]);
  useEffect(() => {
    fetch("/api/competitors")
      .then((r) => r.json())
      .then((d) => d.competitors && setCompetitors(d.competitors))
      .catch(() => {});
  }, []);
  const toggleCompetitor = async (name: string) => {
    const watched = competitors.some((c) => c.name === name);
    const res = await post("/api/competitors", watched ? { remove: name } : { add: name });
    const d = await res.json();
    if (!res.ok) return setToast({ text: d.error ?? "Nepodařilo se uložit" });
    setCompetitors(d.competitors);
    setToast({ text: watched ? `Už nesleduješ ${name}` : `Sleduješ ${name} – dám vědět, když vyhraje` });
  };

  // offline: appka z plochy ukáže poslední uložená data (service worker), tady jen upozornění
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    on();
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  // detail jako krok v historii: tlačítko/gesto Zpět na telefonu detail zavře, místo aby odešlo z appky
  const detailOpen = Boolean(detail);
  useEffect(() => {
    if (!detailOpen) return;
    // stav Next.js zachovat (bez něj by Next při Zpět načetl stránku znovu)
    history.pushState({ ...history.state, zrDetail: true }, "");
    const back = () => setDetail(null);
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      if (history.state?.zrDetail) history.back();
    };
  }, [detailOpen]);

  // poslední návštěva: co je novější, je „nové od minula“. Pauza nad 30 min = nová návštěva.
  const [since, setSince] = useState<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const v = load<{ last?: string; prev?: string }>("zr-visit", {});
    const now = new Date().toISOString();
    const away = !v.last || Date.now() - new Date(v.last).getTime() > 30 * 60_000;
    const next = away ? { prev: v.last ?? now, last: now } : { ...v, last: now };
    setSince(next.prev ?? null);
    save("zr-visit", next);
  }, [ready, synced]);

  // po prvním hledání se na mobilu volby sbalí a výsledky jsou hned nahoře
  const [hasResults, setHasResults] = useState(false);
  useEffect(() => setHasResults(load<ScoredTender[]>("zr-results", []).length > 0), [synced]);

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
        // jiný uživatel na stejném zařízení: data předchozího z prohlížeče smazat, ať se nepomíchají
        if (load<string | null>("zr-user", null) !== (s.user ?? "")) {
          try {
            for (const k of Object.keys(localStorage)) if (k.startsWith("zr-")) localStorage.removeItem(k);
          } catch {}
          save("zr-user", s.user ?? "");
          if (s.multi) return location.reload(); // načíst znovu už jen s daty tohoto uživatele
        }
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
    setHasResults(results.length > 0);
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
    else if (s === "maybe") setToast({ text: "Zvažuješ – najdeš v Moje zakázky", undo: () => applyStatus(t, prev) });
    else if (s === "bid") setToast({ text: "Přidáno do Moje zakázky → Připravuji" });
    else if (s === "won") setToast({ text: "Gratuluji k výhře!" });
  };

  // na široké obrazovce je detail vedle seznamu, ne přes něj
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1200px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const split = Boolean(detail && wide);
  const sideForm = tab === "search" || tab === "market" || tab === "watch";

  // co smí účet hledat: když zvolená oblast není povolená (nebo bez práva úprav nesedí text), přepnout na povolenou
  const access: Access = server.access ?? { presets: null, edit: true };
  useEffect(() => {
    if (!ready || !server.access) return;
    const a = server.access;
    const names = selectedPresets(form.name);
    const ok = names.length && names.every((n) => !a.presets || a.presets.includes(n));
    const c = ok ? combine(PRESETS.map((p) => p.name).filter((n) => names.includes(n))) : null;
    const same = c && c.profile === form.profile && c.keywords === form.keywords && c.cpv === form.cpv;
    if (ok && (a.edit || same)) return;
    const first = PRESETS.find((p) => !a.presets || a.presets.includes(p.name));
    if (first) setForm({ ...form, ...combine(ok ? names : [first.name]) });
  }, [ready, server.access, form.name]);

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
    <KeywordsCtx.Provider value={form.keywords}>
    <main className={`${tab === "search" && hasResults ? "compact" : ""} ${split ? "split" : ""}`}>
      {offline && <div className="warn offline">Jsi offline – vidíš poslední uložená data. Hledání a AI počkají na připojení.</div>}
      <PullToRefresh disabled={Boolean(detail || settings || competitor)} />
      <section className="hero">
        <h1>{HEADINGS[tab]}</h1>
        <p className="sub">
          {tab === "today"
            ? new Date().toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" })
            : tab === "board"
            ? "Zakázky, se kterými pracuješ – přetáhni kartu do dalšího sloupce, jak postupuješ."
            : "AI projde nové veřejné zakázky v celé ČR a vybere ty, kde máš reálnou šanci."}
        </p>
        {tab !== "board" && tab !== "today" && (
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

      {/* na širokém displeji je „Co hledáš“ panel vlevo a výsledky vpravo */}
      <div className={`workspace ${sideForm ? "with-side" : ""}`}>
        {sideForm && (
          <aside className="side">
            <ProfileForm form={form} setForm={setForm} tab={tab} compact={tab === "search" && hasResults} access={access} />
          </aside>
        )}
        <div className="content">
          {tab === "today" && (
            <TodayTab
              key={synced}
              since={since}
              statuses={statuses}
              marked={marked}
              changes={kept.changes}
              buyers={buyers}
              setStatus={setStatus}
              openDetail={setDetail}
              goSearch={() => setTab("search")}
              goBoard={() => setTab("board")}
            />
          )}
          {tab === "search" && (
            <SearchTab
              since={since}
              activeId={detail?.id ?? null}
              wide={wide}
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
          {tab === "watch" && (
            <WatchTab
              form={form}
              server={server}
              setServer={setServer}
              buyers={buyers}
              toggleBuyer={toggleBuyer}
              competitors={competitors}
              toggleCompetitor={toggleCompetitor}
              openCompetitor={setCompetitor}
            />
          )}
        </div>
      </div>
      <footer className="foot">
        Zakázky radar <button className="link" onClick={() => setSettings(true)}>v{VERSION}</button>
      </footer>
    </main>
    </KeywordsCtx.Provider>
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
          keywords={form.keywords}
          status={statuses[detail.id] ?? "new"}
          setStatus={setStatus}
          kept={kept}
          keep={keep}
          ai={ai}
          openCompetitor={setCompetitor}
          watching={buyers.buyers.some((b) => b.name === (marked[detail.id] ?? detail).buyer)}
          split={wide}
          marked={marked}
          toggleBuyer={toggleBuyer}
          close={() => setDetail(null)}
        />
      )}
      {competitor && (
        <Competitor
          name={competitor}
          slovakia={prefs.slovakia}
          watching={competitors.some((c) => c.name === competitor)}
          toggle={() => toggleCompetitor(competitor)}
          close={() => setCompetitor(null)}
        />
      )}
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
const TAB_SHORT: Record<Tab, string> = { today: "Dnes", search: "Zakázky", board: "Moje", market: "Trh", watch: "Hlídání" };

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

        <PushSettings db={server.db} />

        <h3 className="sec">Kalendář lhůt</h3>
        {server.calendar ? (
          <CalendarLink k={server.calendar} />
        ) : (
          <p className="note">Kalendář potřebuje databázi (Upstash).</p>
        )}

        <h3 className="sec">Připojení</h3>
        <Check ok={server.ai} label="AI hodnocení (ANTHROPIC_API_KEY)" />
        <Check ok={server.db} label="Databáze – stejná data na všech zařízeních (Upstash)" />
        <Check ok={server.email && server.cron} label="Ranní e-mail (RESEND_API_KEY, ALERT_EMAIL, CRON_SECRET)" />

        {server.db && <SecurityPanel />}

        {server.multi && server.owner && <AdminPanel />}

        {server.multi && (
          <>
            <h3 className="sec">Účet</h3>
            <p className="note">
              Přihlášen jako <b>{server.user}</b>. Každý účet má vlastní zakázky, poznámky, sledování i nastavení.
            </p>
          </>
        )}

        <h3 className="sec">O aplikaci</h3>
        <p className="note">
          Zakázky radar, verze <b>{VERSION}</b>
        </p>
        <button
          className="ghost logout"
          onClick={() =>
            fetch("/api/logout", { method: "POST" })
              .then(async () => {
                // nic z tohoto účtu nenechat v prohlížeči (sdílený počítač, offline kopie)
                for (const k of Object.keys(localStorage)) if (k.startsWith("zr-")) localStorage.removeItem(k);
                if ("caches" in window) await caches.delete("zr-data-v1");
              })
              .finally(() => location.replace("/login"))
          }
        >
          Odhlásit toto zařízení
        </button>
      </aside>
    </div>
  );
}

const HEADINGS: Record<Tab, string> = {
  today: "Dnes",
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

function ProfileForm(props: { form: Form; setForm: (f: Form) => void; tab: Tab; compact?: boolean; access: Access }) {
  const { form, setForm, tab, compact, access } = props;
  const [open, setOpen] = useState(false);
  // jen oblasti, které účet smí hledat (vlastník má všechny)
  const allowed = PRESETS.filter((p) => !access.presets || access.presets.includes(p.name));
  const selected = selectedPresets(form.name);
  const toggle = (name: string) => {
    const next = selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name];
    if (!next.length) return; // aspoň jedna oblast zůstane
    // pořadí podle karet, ať je název vždy stejný (a paměť AI skóre ho pozná)
    setForm({ ...form, ...combine(PRESETS.map((p) => p.name).filter((n) => next.includes(n))) });
  };
  const all = selected.length === allowed.length;
  return (
    <div className={`card profile ${compact && !open ? "folded" : ""}`}>
      {compact && (
        <button className="profile-summary" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="preset-ic">
            <Icon n={selected.length === 1 ? (PRESET_ICON[selected[0]] ?? "search") : "radar"} size={18} />
          </span>
          <span>
            <small>Hledáš</small>
            <b>{selected.length > 1 ? selected.map((n) => PRESET_SHORT[n] ?? n).join(", ") : form.name}</b>
          </span>
          <span className="chev" aria-hidden="true">
            {open ? "▴" : "▾"}
          </span>
        </button>
      )}
      <div className="step">
        <span>{allowed.length > 1 ? "Co hledáš – vyber jednu nebo víc oblastí" : "Co hledáš"}</span>
        {allowed.length > 1 && (
          <button
            className="link"
            onClick={() => setForm({ ...form, ...combine(all ? [allowed[0].name] : allowed.map((p) => p.name)) })}
          >
            {all ? "Jen první" : "Vybrat všechny"}
          </button>
        )}
      </div>
      <div className="presets">
        {allowed.map((p) => (
          <button
            key={p.name}
            className={`preset ${selected.includes(p.name) ? "on" : ""}`}
            onClick={() => toggle(p.name)}
            aria-pressed={selected.includes(p.name)}
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
        <summary>{access.edit ? "Upravit, co hledám" : "Nastavení hledání"}</summary>
      {tab !== "market" && access.edit && (
        <>
          <label>
            Co nabízím <span className="hint">– podle toho AI hodnotí každou zakázku</span>
          </label>
          <textarea value={form.profile} onChange={(e) => setForm({ ...form, profile: e.target.value })} />
        </>
      )}
      {access.edit && (
        <>
          <label>
            Klíčová slova <span className="hint">– oddělit čárkou</span>
          </label>
          <input value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
        </>
      )}
      <div className="row">
        {access.edit && (
          <div>
            <label>
              CPV kódy <span className="hint">(prázdné = vše)</span>
            </label>
            <input value={form.cpv} onChange={(e) => setForm({ ...form, cpv: e.target.value })} />
          </div>
        )}
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
  since: string | null;
  activeId: string | null;
  wide: boolean;
  form: Form;
  statuses: Record<string, Status>;
  marked: Record<string, ScoredTender>;
  setStatus: (t: ScoredTender, s: Status) => void;
  openDetail: (t: ScoredTender) => void;
  profily?: number;
  ai: Ai;
  onResults: (results: ScoredTender[]) => void;
}) {
  const { since, activeId, wide, form, statuses, marked, setStatus, openDetail, profily, ai, onResults } = props;
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
  // nové od poslední návštěvy nahoru (jen ve „Vše“), uvnitř skupin platí zvolené řazení
  const isNew = (t: ScoredTender) => filter === "all" && isNewSince(t, since, fresh);
  const newer = shown.filter(isNew);
  const older = shown.filter((t) => !isNew(t));
  const ordered = [...newer, ...older];

  // klávesy: ↑↓ nebo J/K výběr, Enter detail, Z/P/N stav, / hledání, ? nápověda
  const [sel, setSel] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    if (activeId) setSel(activeId);
  }, [activeId]);
  const keys = useRef({ ordered, sel, wide, statuses });
  keys.current = { ordered, sel, wide, statuses };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(el.tagName) || el.isContentEditable) return;
      const { ordered, sel, wide, statuses } = keys.current;
      const i = ordered.findIndex((t) => t.id === sel);
      const cur = ordered[i];
      const move = (n: number) => {
        const next = ordered[Math.max(0, Math.min(ordered.length - 1, (i < 0 ? -1 : i) + n))];
        if (!next) return;
        setSel(next.id);
        document.getElementById(`card-${next.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        if (wide) openDetail(next); // vedle seznamu se detail rovnou přepíná
      };
      const k = e.key.toLowerCase();
      if (k === "arrowdown" || k === "j") move(1);
      else if (k === "arrowup" || k === "k") move(-1);
      else if (k === "enter" && cur) openDetail(cur);
      else if (k === "z" && cur) setStatus(cur, statuses[cur.id] === "maybe" ? "new" : "maybe");
      else if (k === "p" && cur) setStatus(cur, statuses[cur.id] === "bid" ? "new" : "bid");
      else if (k === "n" && cur) setStatus(cur, statuses[cur.id] === "no" ? "new" : "no");
      else if (k === "/") document.querySelector<HTMLInputElement>("input.find")?.focus();
      else if (k === "?") setHelp((h) => !h);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const sources = [...new Set(results.map((r) => r.source))];
  const narrowed = Boolean(q) || source !== "all" || region !== "all" || value !== "all";
  const active = [q, source !== "all", region !== "all", value !== "all"].filter(Boolean).length;
  const [sheet, setSheet] = useState(false);
  const clearFilter = () => {
    setQuery("");
    setSource("all");
    setRegion("all");
    setValue("all");
  };
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
          <button className={`filter-btn ${active ? "on" : ""}`} onClick={() => setSheet(true)}>
            <Icon n="search" size={15} />
            Hledat a filtrovat{active ? ` (${active})` : ""}
            <span className="sort-now">{SORTS[sort]}</span>
          </button>
          {sheet && <div className="sheet-bg" onClick={() => setSheet(false)} />}
          <div className={`toolbar ${sheet ? "open" : ""}`}>
            <div className="sheet-head">
              <b>Hledat a filtrovat</b>
              {active > 0 && (
                <button className="link" onClick={clearFilter}>
                  Zrušit filtr
                </button>
              )}
            </div>
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
            <select value={sort} onChange={(e) => changeSort(e.target.value as Sort)} aria-label="Řazení">
              {(Object.keys(SORTS) as Sort[]).map((s) => (
                <option key={s} value={s}>
                  {SORTS[s]}
                </option>
              ))}
            </select>
            <button className="primary sheet-done" onClick={() => setSheet(false)}>
              Zobrazit {shown.length} {shown.length === 1 ? "zakázku" : shown.length < 5 && shown.length > 0 ? "zakázky" : "zakázek"}
            </button>
          </div>
        </div>
      )}
      <div className="list">
        {loading && [0, 1, 2].map((i) => <div key={i} className="card skeleton" />)}
        {!loading &&
          [newer, older].map((group, i) =>
            group.length ? (
              <Fragment key={i}>
                {newer.length > 0 && older.length > 0 && (
                  <div className={`since-line ${i ? "" : "new"}`}>
                    {i ? "Dříve" : `Nové od poslední návštěvy (${newer.length})`}
                  </div>
                )}
                {group.map((t) => (
                  <TenderCard
                    key={t.id}
                    t={t}
                    fresh={fresh.has(t.id)}
                    status={statuses[t.id] ?? "new"}
                    setStatus={setStatus}
                    openDetail={(x) => {
                      setSel(x.id);
                      openDetail(x);
                    }}
                    selected={sel === t.id}
                  />
                ))}
              </Fragment>
            ) : null,
          )}
        {help && (
          <div className="drawer-bg" onClick={() => setHelp(false)}>
            <div className="card keys-help" role="dialog" aria-label="Klávesové zkratky" onClick={(e) => e.stopPropagation()}>
              <b>Klávesové zkratky</b>
              {KEYS.map(([k, l]) => (
                <div key={k}>
                  <kbd>{k}</kbd> <span>{l}</span>
                </div>
              ))}
              <button onClick={() => setHelp(false)}>Zavřít</button>
            </div>
          </div>
        )}
        {shown.length > 0 && !loading && (
          <p className="keys-hint">
            Tip: šipkami ↑↓ procházíš, Z / P / N mění stav, <button className="link" onClick={() => setHelp(true)}>všechny zkratky (?)</button>
          </p>
        )}
        {!shown.length && !loading && (
          <div className="empty">
            {narrowed ? (
              <>
                <b>Filtru nic neodpovídá</b>
                <button className="link" onClick={clearFilter}>
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

const KEYS: [string, string][] = [
  ["↑ ↓ / J K", "předchozí a další zakázka"],
  ["Enter", "otevřít detail"],
  ["Z", "zvažuji"],
  ["P", "podám (připravuji)"],
  ["N", "ne, skrýt"],
  ["/", "hledat v seznamu"],
  ["Esc", "zavřít detail"],
  ["?", "tahle nápověda"],
];

// zakázka je „nová od minula“, když přibyla při posledním hledání nebo byla zveřejněna po poslední návštěvě
const isNewSince = (t: ScoredTender, since: string | null, fresh: Set<string>) =>
  fresh.has(t.id) || Boolean(since && t.published && t.published >= since.slice(0, 10));

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

const SWIPE = 90; // px, od kolika se potažení počítá
// klíčová slova aktuálního hledání – pro vysvětlení skóre na kartě
const KeywordsCtx = createContext("");

// „Proč 92?“: oblast, shoda slov s tím, co hledáš, a zdůvodnění AI
function ScoreWhy({ t, close }: { t: ScoredTender; close: () => void }) {
  const keywords = useContext(KeywordsCtx);
  const text = norm(`${t.title} ${t.description}`);
  // shoda i v jiném tvaru slova: porovnáváme bez posledních dvou písmen („portálu“ ~ „portál“)
  const stem = (k: string) => (k.length > 5 ? k.slice(0, -2) : k);
  const hits = keywords
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k && text.includes(stem(norm(k))));
  return (
    <div className="why" role="dialog" aria-label="Proč toto skóre" onClick={(e) => e.stopPropagation()}>
      <b>Proč {t.score < 0 ? "bez skóre" : t.score}?</b>
      {t.score < 0 ? (
        <p>AI tuto zakázku nehodnotila (vyčerpaný limit nebo chybí klíč).</p>
      ) : (
        <ul>
          <li>
            <span className="hint">Hodnocení:</span> {scoreLabel(t.score)} (
            {t.score >= 75 ? "75 a víc = sedí" : t.score >= 50 ? "50–74 = částečně" : "pod 50 = slabě"})
          </li>
          {t.product && t.product !== "–" && (
            <li>
              <span className="hint">Co z nabídky sedí:</span> {t.product}
            </li>
          )}
          <li>
            <span className="hint">Shoda slov:</span>{" "}
            {hits.length ? hits.slice(0, 6).join(", ") : "žádné z klíčových slov, AI soudila podle obsahu"}
          </li>
          {t.reason && (
            <li>
              <span className="hint">AI:</span> {t.reason}
            </li>
          )}
          {t.value ? (
            <li>
              <span className="hint">Hodnota:</span> {money(t.value, t.currency)}
            </li>
          ) : null}
        </ul>
      )}
      <button className="link" onClick={close}>
        Zavřít
      </button>
    </div>
  );
}

function TenderCard(props: {
  t: ScoredTender;
  fresh: boolean;
  status: Status;
  setStatus: (t: ScoredTender, s: Status) => void;
  openDetail: (t: ScoredTender) => void;
  selected?: boolean;
}) {
  const { t, fresh, status, setStatus, openDetail, selected } = props;
  const [why, setWhy] = useState(false);
  // potažení prstem: doprava = Zvažuji, doleva = Ne. Svislý pohyb nechá stránku rolovat.
  const [dx, setDx] = useState(0);
  const touch = useRef<{ x: number; y: number; lock?: "h" | "v" } | null>(null);
  const swiped = useRef(false);
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t0 = touch.current;
    if (!t0) return;
    const x = e.touches[0].clientX - t0.x;
    const y = e.touches[0].clientY - t0.y;
    if (!t0.lock) {
      if (Math.abs(x) < 10 && Math.abs(y) < 10) return;
      t0.lock = Math.abs(x) > Math.abs(y) * 1.3 ? "h" : "v";
    }
    if (t0.lock === "h") setDx(x);
  };
  const onTouchEnd = () => {
    if (touch.current?.lock === "h") {
      swiped.current = true;
      if (dx > SWIPE) setStatus(t, status === "maybe" ? "new" : "maybe");
      else if (dx < -SWIPE) setStatus(t, "no");
    }
    touch.current = null;
    setDx(0);
  };
  return (
    <div className={`swipe ${dx > SWIPE ? "go-right" : dx < -SWIPE ? "go-left" : ""}`} id={`card-${t.id}`}>
      {dx !== 0 && (
        <div className="swipe-under" aria-hidden="true">
          <span className="right">
            <Icon n="star" size={16} /> {status === "maybe" ? "Zrušit" : "Zvažuji"}
          </span>
          <span className="left">
            Ne <Icon n="x" size={16} />
          </span>
        </div>
      )}
      <article
        className={`card tender ${status === "no" ? "dim" : ""} ${status !== "new" ? `is-${status}` : ""} ${selected ? "selected" : ""} ${dx ? "dragging" : ""}`}
        style={{ "--c-top": scoreColor(t.score), ...(dx ? { transform: `translateX(${dx}px)` } : {}) } as React.CSSProperties}
        onClick={() => {
          if (swiped.current) return void (swiped.current = false);
          openDetail(t);
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <button
          className="score-col"
          title="Proč toto skóre?"
          aria-expanded={why}
          onClick={(e) => {
            e.stopPropagation();
            setWhy(!why);
          }}
        >
          <div className="score" style={{ "--c": scoreColor(t.score), "--p": Math.max(t.score, 0) } as React.CSSProperties}>
            <span>{t.score < 0 ? "–" : t.score}</span>
          </div>
          <small style={{ color: scoreColor(t.score) }}>{scoreLabel(t.score)}</small>
        </button>
        {why && <ScoreWhy t={t} close={() => setWhy(false)} />}
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
    </div>
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
  keywords: string;
  status: Status;
  setStatus: (t: ScoredTender, s: Status) => void;
  kept: Kept;
  keep: Keep;
  ai: Ai;
  openCompetitor: (name: string) => void;
  watching: boolean;
  toggleBuyer: (name: string) => void;
  split: boolean;
  marked: Record<string, ScoredTender>;
  close: () => void;
}) {
  const { t, profile, keywords, status, setStatus, kept, keep, ai, openCompetitor, watching, toggleBuyer, split, marked, close } = props;
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
    if (!split) document.body.style.overflow = "hidden";
    document.querySelector(".drawer")?.scrollTo({ top: 0 });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [t.id, split]);

  // poznámka se uloží až po chvíli bez psaní, ať se databáze nevolá po každém písmenu
  useEffect(() => {
    if (note === (kept.notes[t.id] ?? "")) return;
    const id = setTimeout(() => keep("notes", t.id, note.trim() ? note : null), 700);
    return () => clearTimeout(id);
  }, [note]);

  async function runAi(kind: "analysis" | "draft", uploads?: { name: string; data: string }[]) {
    setBusy(kind);
    setError("");
    try {
      const res = await post("/api/analyze", { kind, profile, tender: t, analysis, model: ai.model, uploads });
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

  // všechny podklady k nabídce v jednom Wordu
  function exportWord() {
    const checks = kept.checks[t.id];
    const items = [...(analysis?.checklist ?? []), ...(checks?.extra ?? [])];
    const blocks: Block[] = [
      { h1: t.title || "(bez názvu)" },
      {
        p: [
          `Zadavatel: ${t.buyer}`,
          `Lhůta: ${t.deadline ? new Date(t.deadline).toLocaleDateString("cs-CZ") : "neuvedena"}`,
          `Předpokládaná hodnota: ${money(t.value, t.currency)}`,
          `Odkaz: ${t.url}`,
        ].join("\n"),
        muted: true,
      },
    ];
    if (analysis) {
      blocks.push({ h2: `Rozbor: ${VERDICT[analysis.verdict].label}` }, { p: `${analysis.verdictReason}\n\n${analysis.summary}` });
      if (analysis.requirements.length) blocks.push({ h2: "Podmínky a kvalifikace" }, { bullets: analysis.requirements });
      if (analysis.criteria?.length) blocks.push({ h2: "Hodnoticí kritéria" }, { bullets: analysis.criteria });
      if (analysis.risks.length) blocks.push({ h2: "Rizika" }, { bullets: analysis.risks });
      blocks.push({ h2: "Co nabídnout" }, { p: analysis.offer });
      if (analysis.questions.length) blocks.push({ h2: "Dotazy na zadavatele" }, { bullets: analysis.questions });
    }
    if (items.length) blocks.push({ h2: "Co připravit do nabídky" }, { checks: items.map((i) => ({ text: i, done: Boolean(checks?.done[i]) })) });
    if (draft) {
      blocks.push({ h2: "Osnova nabídky" });
      for (const o of draft.outline) blocks.push({ p: o.heading }, { bullets: o.points });
      blocks.push({ h2: "Průvodní dopis" }, { p: draft.coverLetter });
    }
    if (kept.notes[t.id]) blocks.push({ h2: "Poznámky" }, { p: kept.notes[t.id] });
    if (!analysis && !draft) blocks.push({ p: "Tip: udělej nejdřív AI rozbor a návrh nabídky, podklady budou úplnější.", muted: true });
    const url = URL.createObjectURL(makeDocx(blocks));
    const a = document.createElement("a");
    a.href = url;
    a.download = `podklady-${(t.title || "zakazka").slice(0, 40).replace(/[^\p{L}\p{N}]+/gu, "-")}.docx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // vlastní dokumentace (když ji portál nepustí): PDF, Word nebo ZIP, dohromady do 4 MB (limit požadavku)
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files];
    if (list.reduce((n, f) => n + f.size, 0) > 4_000_000) {
      setError("Soubory jsou dohromady větší než 4 MB. Nahraj jen zadávací dokumentaci nebo výzvu.");
      return;
    }
    const b64 = async (f: File) => {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    };
    runAi("analysis", await Promise.all(list.map(async (f) => ({ name: f.name, data: await b64(f) }))));
  }
  const uploadButton = (label: string) => (
    <label className="link upload">
      {label}
      <input type="file" multiple accept=".pdf,.docx,.zip" hidden onChange={(e) => upload(e.target.files)} />
    </label>
  );

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
    <div className={`drawer-bg ${split ? "split" : ""}`} onClick={close}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal={!split}
        aria-label={t.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <button className="back" onClick={close}>
            ← Zpět
          </button>
          <div className="tags">
            <span className="tag">{t.source}</span>
            {t.kind === "upcoming" && <span className="tag soon">připravovaná</span>}
            {t.product && t.product !== "–" && <span className="tag accent">{t.product}</span>}
          </div>
          <button className="icon" onClick={close} aria-label="Zavřít">
            ×
          </button>
        </div>
        <h2 className="drawer-title" id="d-top">
          {t.title || "(bez názvu)"}
        </h2>
        <div className="drawer-buyer">
          <span>{t.buyer}</span>
          {t.buyer && (
            <button className={`ghost follow ${watching ? "on" : ""}`} onClick={() => toggleBuyer(t.buyer)}>
              <Icon n={watching ? "check" : "eye"} size={14} />
              {watching ? "Sleduješ" : "Sledovat zadavatele"}
            </button>
          )}
        </div>
        <nav className="jump" aria-label="Části detailu">
          {JUMPS.map(([id, label]) => (
            <button key={id} onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              {label}
            </button>
          ))}
        </nav>

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

        {(status === "won" || status === "lost") && (
          <OutcomeForm
            key={`o-${t.id}`}
            won={status === "won"}
            value={kept.results[t.id] ?? null}
            save={(v) => keep("results", t.id, v)}
          />
        )}

        <BuyerSection
          key={t.id}
          t={t}
          profile={profile}
          keywords={keywords}
          ai={ai}
          saved={kept.history[t.id] ?? null}
          keep={keep}
          openCompetitor={openCompetitor}
        />

        <h3 className="sec" id="d-ai">
          AI rozbor
        </h3>
        {!analysis && busy !== "analysis" && (
          <div className="ai-cta">
            <span>
              {ai.noAi
                ? "Měsíční limit za AI je vyčerpaný, změníš ho v Nastavení."
                : "Najde a přečte zadávací dokumentaci (PDF, Word) a řekne, co chtějí, jaké mají podmínky, rizika, co nabídnout a co přiložit."}
              {!ai.noAi && <> {uploadButton("Nebo nahraj dokumentaci sám")}</>}
            </span>
            <button className="primary" onClick={analyze} disabled={ai.noAi || busy !== null}>
              Udělat rozbor
            </button>
          </div>
        )}
        {busy === "analysis" && (
          <div className="ai-cta">
            <div className="radar" aria-hidden="true" />
            <span>Hledám a čtu zadávací dokumentaci, asi 30–60 vteřin…</span>
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
            <AnalysisList title="Hodnoticí kritéria" items={analysis.criteria ?? []} />
            <AnalysisList title="Na co se zeptat zadavatele" items={analysis.questions} />
            <p className="note sources">
              {analysis.sources?.length
                ? `Přečteno: ${analysis.sources.join(", ")}.`
                : "Dokumentaci se nepodařilo stáhnout, rozbor je jen ze stránky zakázky."}{" "}
              {!ai.noAi && busy !== "analysis" && uploadButton(analysis.sources?.length ? "Nahrát jinou dokumentaci" : "Nahraj ji sám")}
            </p>
            {busy !== "analysis" && !ai.noAi && (
              <button className="link" onClick={analyze}>
                Udělat rozbor znovu
              </button>
            )}
          </div>
        )}

        {analysis?.checklist?.length ? (
          <Checklist
            items={analysis.checklist}
            value={kept.checks[t.id] ?? { done: {}, extra: [] }}
            save={(v) => keep("checks", t.id, v)}
          />
        ) : null}

        <PriceHelper t={t} results={kept.results} marked={marked} />

        <div className="export">
          <button onClick={exportWord}>
            <Icon n="download" size={16} /> Stáhnout podklady do Wordu
          </button>
          <span className="hint">rozbor, checklist, osnova, průvodní dopis a poznámky v jednom souboru</span>
        </div>

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

        <h3 className="sec" id="d-notes">
          Poznámky
        </h3>
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

// co přiložit k nabídce: body z AI rozboru + vlastní, odškrtávání se ukládá (i na mobil)
function Checklist({ items, value, save }: { items: string[]; value: Checks; save: (v: Checks) => void }) {
  const [add, setAdd] = useState("");
  const all = [...items, ...value.extra];
  const done = all.filter((i) => value.done[i]).length;
  const toggle = (i: string) => save({ ...value, done: { ...value.done, [i]: !value.done[i] } });
  return (
    <>
      <h3 className="sec">
        Co připravit do nabídky{" "}
        <span className={`count ${done === all.length ? "all" : ""}`}>
          {done}/{all.length}
        </span>
      </h3>
      <div className="meter">
        <span style={{ width: `${(done / Math.max(1, all.length)) * 100}%`, background: "var(--good)" }} />
      </div>
      <ul className="checklist">
        {all.map((i) => (
          <li key={i} className={value.done[i] ? "done" : ""}>
            <label>
              <input type="checkbox" checked={Boolean(value.done[i])} onChange={() => toggle(i)} />
              <span>{i}</span>
            </label>
            {value.extra.includes(i) && (
              <button className="link" onClick={() => save({ ...value, extra: value.extra.filter((x) => x !== i) })}>
                odebrat
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="add-item"
        onSubmit={(e) => {
          e.preventDefault();
          if (add.trim() && !all.includes(add.trim())) save({ ...value, extra: [...value.extra, add.trim()] });
          setAdd("");
        }}
      >
        <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Přidat vlastní položku…" />
        <button disabled={!add.trim()}>Přidat</button>
      </form>
    </>
  );
}

// doporučená cena bez AI: předpokládaná hodnota, ceny podobných zakázek (ISVZ, TED, Registr smluv) a tvoje výsledky
function PriceHelper({ t, results, marked }: { t: ScoredTender; results: Record<string, Outcome>; marked: Record<string, ScoredTender> }) {
  const [m, setM] = useState<Market | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setM(null), [t.id]);

  // jak blízko odhadu se v minulosti vyhrávalo (vítězná cena / předpokládaná hodnota)
  const ratios = Object.entries(results)
    .map(([id, r]) => ({ r, est: marked[id]?.value }))
    .filter(({ r, est }) => r.price && est)
    .map(({ r, est }) => r.price! / est!);
  const ownRatio = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;

  async function load() {
    setBusy(true);
    try {
      const res = await post("/api/market", {
        cpv: t.cpv.slice(0, 4).join(" "),
        keywords: t.cpv.length ? "" : t.title,
        days: 1095,
      });
      if (res.ok) setM(await res.json());
    } finally {
      setBusy(false);
    }
  }

  const est = t.value && (t.currency ?? "CZK") === "CZK" ? t.value : null;
  const p = m?.prices;
  // odhad: u známé hodnoty 85–95 % (s vlastní zkušeností její poměr ±5 %), jinak běžné rozpětí podobných
  const range: [number, number] | null = est
    ? ownRatio
      ? [est * Math.max(0.5, ownRatio - 0.05), est * Math.min(1, ownRatio + 0.05)]
      : [est * 0.85, est * 0.95]
    : p?.p25 && p.median
      ? [p.p25, p.median]
      : null;

  return (
    <>
      <h3 className="sec">Doporučená cena</h3>
      {!m && !est ? (
        <button onClick={load} disabled={busy}>
          {busy ? "Počítám…" : "Spočítat z cen podobných zakázek (zdarma)"}
        </button>
      ) : (
        <div className="price">
          {range ? (
            <p className="price-range">
              <b>
                {moneyShort(range[0])} – {moneyShort(range[1])}
              </b>{" "}
              <span className="hint">bez DPH</span>
            </p>
          ) : (
            <p className="note">Bez předpokládané hodnoty a bez podobných zakázek se cena odhadnout nedá.</p>
          )}
          <ul className="price-why">
            {est && <li>Předpokládaná hodnota zakázky: {money(est)}.</li>}
            {ownRatio && (
              <li>
                Tvoje uzavřené zakázky: vítězná cena byla v průměru {Math.round(ownRatio * 100)} % předpokládané hodnoty
                ({ratios.length}×).
              </li>
            )}
            {!ownRatio && est && <li>Běžně se vyhrává 5–15 % pod předpokládanou hodnotou; zapisuj výsledky a odhad se zpřesní.</li>}
            {p?.median ? (
              <li>
                Podobné zakázky ({p.count}): medián {money(p.median)}, běžně {money(p.p25, "")}– {money(p.p75)}.
              </li>
            ) : m ? (
              <li>Podobné zakázky s cenou jsme nenašli.</li>
            ) : null}
            {m?.offers ? <li>Průměrně {m.offers.avg.toFixed(1).replace(".", ",")} nabídky na zakázku.</li> : null}
          </ul>
          {!m && (
            <button className="link" onClick={load} disabled={busy}>
              {busy ? "Načítám…" : "Porovnat s cenami podobných zakázek"}
            </button>
          )}
        </div>
      )}
    </>
  );
}

// výsledek po rozhodnutí: kdo vyhrál a za kolik – pro přehled úspěšnosti a příští odhad ceny
function OutcomeForm({ won, value, save }: { won: boolean; value: Outcome | null; save: (v: Outcome) => void }) {
  const [v, setV] = useState<Outcome>(value ?? { winner: won ? "my" : "", price: null, ourPrice: null, note: "", date: today() });
  const [saved, setSaved] = useState(false);
  const num = (s: string) => (s.trim() ? Number(s.replace(/\s/g, "").replace(",", ".")) || null : null);
  return (
    <form
      className="card outcome"
      onSubmit={(e) => {
        e.preventDefault();
        save(won ? { ...v, winner: "my", price: v.ourPrice } : v);
        setSaved(true);
      }}
    >
      <b>{won ? "Výhra – zapiš cenu" : "Kdo vyhrál?"}</b>
      <div className="row">
        {!won && (
          <div>
            <label>Vítěz</label>
            <input value={v.winner} onChange={(e) => setV({ ...v, winner: e.target.value })} placeholder="Název firmy" />
          </div>
        )}
        {!won && (
          <div>
            <label>Vítězná cena (Kč bez DPH)</label>
            <input inputMode="decimal" defaultValue={v.price ?? ""} onChange={(e) => setV({ ...v, price: num(e.target.value) })} />
          </div>
        )}
        <div>
          <label>{won ? "Naše cena (Kč bez DPH)" : "Naše nabídka (Kč bez DPH)"}</label>
          <input inputMode="decimal" defaultValue={v.ourPrice ?? ""} onChange={(e) => setV({ ...v, ourPrice: num(e.target.value) })} />
        </div>
      </div>
      <label>Poznámka (proč, co příště jinak)</label>
      <input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      <div className="row-btns">
        <button className="primary" style={{ marginTop: 10 }}>
          Uložit výsledek
        </button>
        {saved && <span className="saved">Uloženo</span>}
      </div>
    </form>
  );
}

// rychlé skoky v detailu zakázky (hlavně na mobilu, kde je detail dlouhý)
const JUMPS: [string, string][] = [
  ["d-top", "Přehled"],
  ["d-history", "Historie"],
  ["d-ai", "AI rozbor"],
  ["d-notes", "Poznámky"],
];

// appka z plochy nemá obnovení stažením stránky dolů jako prohlížeč – doplníme ho
function PullToRefresh({ disabled }: { disabled: boolean }) {
  const [pull, setPull] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    if (!standalone || disabled) return;
    let dist = 0;
    const down = (e: TouchEvent) => {
      start.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (start.current === null) return;
      dist = Math.max(0, Math.min(120, (e.touches[0].clientY - start.current) * 0.5));
      setPull(dist);
    };
    const up = () => {
      if (start.current !== null && dist >= 70) location.reload();
      start.current = null;
      dist = 0;
      setPull(0);
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, [disabled]);
  if (!pull) return null;
  return (
    <div className="ptr" style={{ height: pull }} aria-hidden="true">
      <span style={{ transform: `rotate(${pull * 3}deg)`, opacity: Math.min(1, pull / 70) }}>
        <Icon n="radar" size={20} />
      </span>
      <small>{pull >= 70 ? "Pusť pro obnovení" : "Táhni dolů"}</small>
    </div>
  );
}

const TOP_SHOWN = 12;

// historie zadavatele: co za posledních 5 let podepsal, IT a související s touto zakázkou nahoře
// úvodní obrazovka: co je nové, co hoří a co doporučuje AI
function TodayTab(props: {
  since: string | null;
  statuses: Record<string, Status>;
  marked: Record<string, ScoredTender>;
  changes: Record<string, Change[]>;
  buyers: Buyers;
  setStatus: (t: ScoredTender, s: Status) => void;
  openDetail: (t: ScoredTender) => void;
  goSearch: () => void;
  goBoard: () => void;
}) {
  const { since, statuses, marked, changes, buyers, setStatus, openDetail, goSearch, goBoard } = props;
  const [results, setResults] = useState<ScoredTender[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    setResults(load("zr-results", []));
    setFresh(new Set(load<string[]>("zr-fresh", [])));
  }, []);

  const week = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);
  const open = (t: ScoredTender) => !t.deadline || t.deadline >= today();
  const newOnes = results.filter((t) => !statuses[t.id] && open(t) && isNewSince(t, since, fresh));
  const tips = results
    .filter((t) => !statuses[t.id] && open(t) && t.score >= 70)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const deadlines = Object.values(marked)
    .filter((t) => ["maybe", "bid"].includes(statuses[t.id]) && t.deadline && t.deadline >= today() && t.deadline <= week)
    .sort(CMP.deadline);
  const changed = Object.values(marked).filter((t) => changes[t.id]?.length && ACTIVE.includes(statuses[t.id]));
  const fromBuyers = buyers.tenders.filter((t) => !statuses[t.id]).slice(0, 5);
  const lastSearch = results.length ? null : "Ještě jsi nehledal.";

  const tiles: { v: number; l: string; cls?: string; go?: () => void }[] = [
    { v: newOnes.length, l: "nových od minula", cls: newOnes.length ? "new" : "", go: goSearch },
    { v: deadlines.length, l: "lhůt tento týden", cls: deadlines.length ? "warn" : "", go: goBoard },
    { v: changed.length, l: "změn u sledovaných", cls: changed.length ? "warn" : "", go: goBoard },
    { v: fromBuyers.length, l: "od sledovaných zadavatelů" },
  ];

  return (
    <>
      <div className="summary today-tiles">
        {tiles.map((x) => (
          <button key={x.l} className={x.cls} onClick={x.go} disabled={!x.go}>
            <b>{x.v}</b>
            <span>{x.l}</span>
          </button>
        ))}
      </div>

      <div className="today-grid">
        <div className="today-main">
          <h2>
            <Icon n="sparkle" size={16} /> Nejlepší tipy
          </h2>
          {tips.length ? (
            <div className="list">
              {tips.map((t) => (
                <TenderCard
                  key={t.id}
                  t={t}
                  fresh={fresh.has(t.id)}
                  status={statuses[t.id] ?? "new"}
                  setStatus={setStatus}
                  openDetail={openDetail}
                />
              ))}
            </div>
          ) : (
            <div className="empty">
              <span className="empty-ic">
                <Icon n="radar" size={28} />
              </span>
              <b>{lastSearch ?? "Žádný nový tip nad 70 bodů"}</b>
              <span>V záložce Zakázky klikni na Hledat – AI vybere, co sedí na tvou nabídku.</span>
            </div>
          )}
          <button className="primary big" onClick={goSearch}>
            <Icon n="search" size={18} />
            {results.length ? `Všechny vhodné zakázky (${results.length})` : "Najít zakázky"}
          </button>
        </div>
        <div className="today-side">
          {deadlines.length > 0 && (
            <div className="card mine urgent-box">
              <div className="mine-head">
                <b>
                  <Icon n="clock" size={15} /> Lhůty tento týden
                </b>
              </div>
              {deadlines.map((t) => (
                <button key={t.id} className="mine-row" onClick={() => openDetail(t)}>
                  <span>{t.title}</span>
                  <Deadline d={t.deadline} short />
                </button>
              ))}
            </div>
          )}

          {changed.length > 0 && (
            <div className="card mine">
              <div className="mine-head">
                <b>Změny u sledovaných zakázek</b>
              </div>
              {changed.map((t) => (
                <button key={t.id} className="mine-row" onClick={() => openDetail(t)}>
                  <span>{t.title}</span>
                  <span className="tag changed">
                    {[...new Set(changes[t.id].map((c) => CHANGE_LABEL[c.field].toLowerCase()))].join(", ")}
                  </span>
                </button>
              ))}
            </div>
          )}
          {fromBuyers.length > 0 && (
            <>
              <h2>
                <Icon n="eye" size={16} /> Od sledovaných zadavatelů
              </h2>
              <div className="card mine">
                {fromBuyers.map((t) => (
                  <button key={t.id} className="mine-row" onClick={() => openDetail(t)}>
                    <span>
                      {t.title}
                      <small className="hint"> · {t.buyer}</small>
                    </span>
                    <Deadline d={t.deadline} short />
                  </button>
                ))}
              </div>
            </>
          )}
          {!deadlines.length && !changed.length && !fromBuyers.length && (
            <div className="card calm">
              <b>Klid</b>
              <span>Tento týden žádná lhůta, změna ani novinka od sledovaných zadavatelů.</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
function BuyerSection(props: {
  t: ScoredTender;
  profile: string;
  keywords: string;
  ai: Ai;
  saved: BuyerAi | null;
  keep: Keep;
  openCompetitor: (name: string) => void;
}) {
  const { t, profile, keywords, ai, saved, keep, openCompetitor } = props;
  const [hist, setHist] = useState<BuyerHistory | null>(null);
  const [busy, setBusy] = useState<"list" | "ai" | null>(null);
  const [error, setError] = useState("");
  const [all, setAll] = useState(false);

  async function load(kind: "list" | "ai") {
    setBusy(kind);
    setError("");
    try {
      const body =
        kind === "list"
          ? { kind, tender: t, keywords }
          : { kind, tender: t, profile, model: ai.model, items: hist!.items.filter((c) => c.it || c.related > 0) };
      const res = await post("/api/buyer", body);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `Chyba ${res.status}`);
      if (kind === "list") setHist(d);
      else {
        ai.onCost(d.cost ?? 0);
        keep("history", t.id, d.data);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  // po AI zhodnocení jdou nahoru smlouvy, které AI označila, podle její relevance
  const notes = new Map((saved?.items ?? []).map((x) => [x.id, x]));
  const items = hist?.items ?? [];
  const top = items
    .filter((c) => c.it || c.related > 0 || notes.has(c.id))
    .sort((a, b) => (notes.get(b.id)?.relevance ?? -1) - (notes.get(a.id)?.relevance ?? -1));
  const rest = items.filter((c) => !top.includes(c));

  return (
    <>
      <h3 className="sec" id="d-history">
        Historie zadavatele
      </h3>
      {!hist ? (
        <div className="ai-cta">
          {busy === "list" ? (
            <>
              <div className="radar" aria-hidden="true" />
              <span>Hledám smlouvy a zakázky zadavatele, asi 10–30 vteřin…</span>
            </>
          ) : (
            <>
              <span>
                Co všechno <b>{t.buyer}</b> za posledních 5 let podepsal a s kým. Nahoře IT a to, co souvisí s touto
                zakázkou. Zdarma.
              </span>
              <button className="primary" onClick={() => load("list")}>
                Zobrazit historii
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="history">
          <p className="note">
            {hist.buyer.ico ? (
              <>
                {hist.buyer.name}, IČO{" "}
                <a href={`https://www.hlidacstatu.cz/subjekt/${hist.buyer.ico}`} target="_blank" rel="noreferrer">
                  {hist.buyer.ico}
                </a>
                {". "}
              </>
            ) : (
              <>IČO zadavatele se nepodařilo dohledat, hledám podle přesného názvu. </>
            )}
            {hist.full
              ? `Všechny smlouvy z Registru smluv za ${hist.years} let (Hlídač státu) a zakázky z ISVZ.`
              : "Jen IT smlouvy, které sbíráme sami (24 měsíců), a zakázky z ISVZ. Celou historii za 5 let ukáže Hlídač státu – stačí přidat HLIDAC_TOKEN ve Vercelu."}
          </p>
          {hist.warnings.map((w) => (
            <div key={w} className="warn">
              {w}
            </div>
          ))}

          {top.length > 0 &&
            (saved ? (
              <div className="hist-ai">
                <b>
                  <Icon n="sparkle" size={14} /> AI zhodnocení
                </b>
                <p>{saved.summary}</p>
                <p>
                  <span className="hint">Současný dodavatel:</span> {saved.incumbent}
                </p>
                <p>
                  <span className="hint">Ceny:</span> {saved.prices}
                </p>
              </div>
            ) : (
              <div className="ai-cta">
                {busy === "ai" ? (
                  <>
                    <div className="radar" aria-hidden="true" />
                    <span>AI čte smlouvy zadavatele…</span>
                  </>
                ) : (
                  <>
                    <span>AI určí současného dodavatele, cenovou hladinu a ke každé související smlouvě napíše proč.</span>
                    <button className="primary" onClick={() => load("ai")} disabled={ai.noAi || busy !== null}>
                      AI zhodnocení
                    </button>
                  </>
                )}
              </div>
            ))}
          {error && <div className="warn">{error}</div>}

          <h4>
            IT a související <span className="count">{top.length}</span>
          </h4>
          {top.length ? (
            (all ? top : top.slice(0, TOP_SHOWN)).map((c) => (
              <ContractRow key={c.id} c={c} note={notes.get(c.id)?.note} openCompetitor={openCompetitor} />
            ))
          ) : (
            <p className="note">Zadavatel za tu dobu nic z IT nepodepsal (nebo to v datech není).</p>
          )}
          {!all && top.length > TOP_SHOWN && (
            <button className="link" onClick={() => setAll(true)}>
              Zobrazit všech {top.length}
            </button>
          )}
          {rest.length > 0 && (
            <details>
              <summary>Ostatní smlouvy ({rest.length})</summary>
              {rest.map((c) => (
                <ContractRow key={c.id} c={c} openCompetitor={openCompetitor} />
              ))}
            </details>
          )}
        </div>
      )}
      {!hist && error && <div className="warn">{error}</div>}
    </>
  );
}

function ContractRow({ c, note, openCompetitor }: { c: Contract; note?: string; openCompetitor: (name: string) => void }) {
  return (
    <div className="hist-row">
      <div className="hist-main">
        <a href={c.url} target="_blank" rel="noreferrer">
          {c.title}
        </a>
        <div className="hist-meta">
          {c.suppliers[0] && (
            <button className="link name" onClick={() => openCompetitor(c.suppliers[0])} title="Profil dodavatele">
              {c.suppliers[0]}
            </button>
          )}
          {c.date && <span>{new Date(c.date).toLocaleDateString("cs-CZ")}</span>}
          <span>{c.source}</span>
          {c.offers ? <span>{c.offers} nabídek</span> : null}
        </div>
        {note && (
          <p className="hist-note">
            <Icon n="sparkle" size={12} /> {note}
          </p>
        )}
      </div>
      <div className="hist-side">
        <b>{c.value ? money(c.value) : "–"}</b>
        <span className="tags">
          {c.related > 0 && <span className="tag accent">souvisí</span>}
          {c.it && <span className="tag">IT</span>}
        </span>
      </div>
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

function Competitor(props: { name: string; slovakia: boolean; watching: boolean; toggle: () => void; close: () => void }) {
  const { name, slovakia, watching, toggle, close } = props;
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
        <button className={`ghost follow ${watching ? "on" : ""}`} onClick={toggle}>
          <Icon n={watching ? "check" : "eye"} size={14} />
          {watching ? "Sleduješ – dám vědět, když vyhraje" : "Sledovat konkurenta"}
        </button>
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

function WatchTab(props: {
  form: Form;
  server: ServerState;
  setServer: (s: ServerState) => void;
  buyers: Buyers;
  toggleBuyer: (name: string) => void;
  competitors: { name: string; added: string }[];
  toggleCompetitor: (name: string) => void;
  openCompetitor: (name: string) => void;
}) {
  const { form, server, setServer, buyers, toggleBuyer, competitors, toggleCompetitor, openCompetitor } = props;
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
          <h2>Sledovaní zadavatelé</h2>
          <p className="note">
            Upozorním na každou novou zakázku od nich, i když nesedí na klíčová slova. Přidáš je v detailu zakázky tlačítkem
            „Sledovat zadavatele“.
          </p>
          <div className="card">
            {buyers.buyers.length ? (
              buyers.buyers.map((b) => (
                <div key={b.name} className="check ok">
                  <Icon n="eye" size={16} />
                  <span>
                    {b.name}
                    {b.ico && <span className="hint"> · IČO {b.ico}</span>}
                    <span className="hint"> · {buyers.tenders.filter((t) => t.buyer === b.name).length} otevřených</span>
                  </span>
                  <button className="link state" onClick={() => toggleBuyer(b.name)}>
                    Přestat sledovat
                  </button>
                </div>
              ))
            ) : (
              <p className="note">Zatím nikoho nesleduješ.</p>
            )}
          </div>
          <h2>Sledovaní konkurenti</h2>
          <p className="note">
            Ráno dám vědět, když vyhrají zakázku nebo podepíšou smlouvu (TED, Registr smluv, ISVZ). Přidáš je v profilu
            konkurenta – klikni na jméno dodavatele v Průzkumu trhu nebo v historii zadavatele.
          </p>
          <div className="card">
            {competitors.length ? (
              competitors.map((c) => (
                <div key={c.name} className="check ok">
                  <Icon n="eye" size={16} />
                  <button className="link name" onClick={() => openCompetitor(c.name)}>
                    {c.name}
                  </button>
                  <button className="link state" onClick={() => toggleCompetitor(c.name)}>
                    Přestat sledovat
                  </button>
                </div>
              ))
            ) : (
              <p className="note">Zatím nikoho nesleduješ.</p>
            )}
          </div>
          <h2>Hlídané profily</h2>
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

// Zabezpečení vlastního účtu: dvoufázové ověření (aplikace s kódy) a přihlášená zařízení
type Account = {
  twoFa: boolean;
  recoveryLeft: number;
  sessions: { sid: string; created: string; seen: string; device: string; current: boolean }[];
};
function SecurityPanel() {
  const [acc, setAcc] = useState<Account | null>(null);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const reload = () =>
    fetch("/api/account")
      .then((r) => r.json())
      .then(setAcc)
      .catch(() => {});
  useEffect(() => {
    reload();
  }, []);

  async function call(action: string, extra: object = {}) {
    setError("");
    const res = await post("/api/account", { action, ...extra });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Nepodařilo se");
      return null;
    }
    return d;
  }
  const qr = (uri: string) => {
    const q = qrcode(0, "M");
    q.addData(uri);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  };
  const when = (iso: string) => new Date(iso).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <h3 className="sec">Zabezpečení</h3>
      {error && <div className="warn">{error}</div>}

      <h4 className="sub-h">Dvoufázové ověření</h4>
      {recovery ? (
        <div className="card twofa">
          <b>Zapnuto. Ulož si záložní kódy</b>
          <p className="note">
            Když ztratíš telefon, přihlásíš se jedním z nich (každý platí jednou). Ukazují se jen teď – ulož je do
            správce hesel nebo vytiskni.
          </p>
          <pre className="codes">{recovery.join("\n")}</pre>
          <div className="row-btns">
            <button onClick={() => navigator.clipboard.writeText(recovery.join("\n"))}>Kopírovat</button>
            <button
              className="primary"
              onClick={() => {
                setRecovery(null);
                reload();
              }}
            >
              Uloženo
            </button>
          </div>
        </div>
      ) : acc?.twoFa ? (
        <div className="twofa">
          <p className="note">
            <span className="saved">
              <Icon n="check" size={14} /> Zapnuto
            </span>{" "}
            · záložních kódů zbývá {acc.recoveryLeft}
          </p>
          <div className="add-item">
            <input inputMode="numeric" placeholder="Kód z aplikace" value={code} onChange={(e) => setCode(e.target.value)} />
            <button
              className="ghost"
              disabled={!code}
              onClick={async () => {
                if (await call("2fa-disable", { code })) {
                  setCode("");
                  reload();
                }
              }}
            >
              Vypnout
            </button>
          </div>
        </div>
      ) : setup ? (
        <div className="card twofa">
          <b>1. Naskenuj kód v ověřovací aplikaci</b>
          <p className="note">Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden…</p>
          <div className="qr" dangerouslySetInnerHTML={{ __html: qr(setup.uri) }} />
          <p className="note">
            Na telefonu můžeš ťuknout: <a href={setup.uri}>otevřít v aplikaci</a>. Nebo opiš klíč:{" "}
            <code className="secret">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
          </p>
          <b>2. Zadej šestimístný kód z aplikace</b>
          <div className="add-item">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123 456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button
              className="primary"
              style={{ marginTop: 0 }}
              disabled={!code}
              onClick={async () => {
                const d = await call("2fa-confirm", { code });
                if (d) {
                  setRecovery(d.recovery);
                  setSetup(null);
                  setCode("");
                }
              }}
            >
              Zapnout
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="note">Při přihlášení bude kromě hesla potřeba i kód z aplikace v telefonu.</p>
          <button
            onClick={async () => {
              const d = await call("2fa-begin");
              if (d) setSetup(d);
            }}
          >
            <Icon n="shield" size={16} /> Zapnout dvoufázové ověření
          </button>
        </>
      )}

      <h4 className="sub-h">Přihlášená zařízení</h4>
      {acc?.sessions.map((x) => (
        <div key={x.sid} className="check ok">
          <span>
            {x.device}
            {x.current && <b className="saved"> · toto zařízení</b>}
            <br />
            <span className="hint">
              přihlášeno {when(x.created)}, naposledy {when(x.seen)}
            </span>
          </span>
          {!x.current && (
            <button
              className="link state"
              onClick={async () => {
                if (await call("revoke", { sid: x.sid })) reload();
              }}
            >
              Odhlásit
            </button>
          )}
        </div>
      ))}
      {(acc?.sessions.length ?? 0) > 1 && (
        <button
          className="ghost"
          onClick={async () => {
            if (await call("revoke-others")) reload();
          }}
        >
          Odhlásit všechna ostatní zařízení
        </button>
      )}
    </>
  );
}

// Správa účtů (jen vlastník): které oblasti smí ostatní hledat a jestli smí upravovat klíčová slova
function AdminPanel() {
  const [list, setList] = useState<{ name: string; email: boolean; access: Access; twoFa: boolean; hashed: boolean }[] | null>(null);
  const [plain, setPlain] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  useEffect(() => {
    fetch("/api/admin")
      .then((r) => r.json())
      .then((d) => {
        if (!d.users) return setError(d.error ?? "Nepodařilo se načíst účty");
        setList(d.users);
        setPlain(d.plain ?? []);
      })
      .catch(() => setError("Nepodařilo se načíst účty"));
  }, []);

  async function act(name: string, what: { reset2fa?: boolean; logoutAll?: boolean }, done: string) {
    const res = await post("/api/admin", { name, ...what });
    const d = await res.json();
    if (!res.ok) return setError(d.error ?? "Nepodařilo se");
    setError("");
    if (what.reset2fa) setList((cur) => cur?.map((u) => (u.name === name ? { ...u, twoFa: false } : u)) ?? cur);
    setSaved(`${name}: ${done}`);
    setTimeout(() => setSaved(""), 2500);
  }

  async function change(name: string, access: Access) {
    setList((cur) => cur?.map((u) => (u.name === name ? { ...u, access } : u)) ?? cur);
    const res = await post("/api/admin", { name, access });
    const d = await res.json();
    if (!res.ok) setError(d.error ?? "Uložení selhalo");
    else {
      setError("");
      setSaved(name);
      setTimeout(() => setSaved(""), 1500);
    }
  }

  return (
    <>
      <h3 className="sec">Správa účtů</h3>
      <p className="note">
        Co smí ostatní hledat. Platí hned (po obnovení stránky) a kontroluje se i na serveru. Účet přidáš ve Vercelu
        proměnnou USER_JMENO (hodnotu vyrobíš na /heslo).
      </p>
      {error && <div className="warn">{error}</div>}
      {plain.length > 0 && (
        <div className="warn">
          Hesla účtů {plain.join(", ")} jsou ve Vercelu v čitelné podobě. Vyrob jejich odtlačky na stránce{" "}
          <a href="/heslo" target="_blank" rel="noreferrer">
            /heslo
          </a>{" "}
          a vlož je do proměnných účtů ve Vercelu (OWNER_… / USER_…) místo hesel.
        </div>
      )}
      {saved.includes(":") && <p className="note saved">{saved}</p>}
      {list?.length === 0 && <p className="note">Kromě tebe tu zatím nikdo není.</p>}
      {list?.map((u) => {
        const names = u.access.presets ?? PRESETS.map((p) => p.name);
        const toggle = (p: string) => {
          const next = names.includes(p) ? names.filter((n) => n !== p) : [...names, p];
          if (!next.length) return; // aspoň jedna oblast
          change(u.name, { ...u.access, presets: next.length === PRESETS.length ? null : next });
        };
        return (
          <div key={u.name} className="card admin-user">
            <b>
              {u.name} {saved === u.name && <span className="saved">uloženo</span>}
            </b>
            <span className="hint">Smí hledat:</span>
            {PRESETS.map((p) => (
              <label key={p.name} className="check-row">
                <input type="checkbox" checked={names.includes(p.name)} onChange={() => toggle(p.name)} />
                <span>{p.name}</span>
              </label>
            ))}
            <label className="check-row">
              <input
                type="checkbox"
                checked={u.access.edit}
                onChange={() => change(u.name, { ...u.access, edit: !u.access.edit })}
              />
              <span>Smí upravovat klíčová slova a popis nabídky</span>
            </label>
            {!u.email && <span className="hint">Ranní e-mail nemá (jen upozornění na telefon).</span>}
            <span className="hint">
              Dvoufázové ověření: {u.twoFa ? "zapnuté" : "vypnuté"}
              {u.hashed ? "" : " · heslo v čitelné podobě"}
            </span>
            <div className="row-btns">
              {u.twoFa && (
                <button className="ghost" onClick={() => act(u.name, { reset2fa: true }, "dvoufázové ověření vypnuto")}>
                  Vypnout 2FA (ztracený telefon)
                </button>
              )}
              <button className="ghost" onClick={() => act(u.name, { logoutAll: true }, "odhlášen ze všech zařízení")}>
                Odhlásit ze všech zařízení
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

// upozornění na telefon: přihlášení zařízení přes service worker a Web Push
function PushSettings({ db }: { db: boolean }) {
  const [state, setState] = useState<"unknown" | "unsupported" | "off" | "on" | "denied">("unknown");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const ios = typeof navigator !== "undefined" && /iPhone|iPad/.test(navigator.userAgent);
  const standalone = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("denied");
    navigator.serviceWorker.getRegistration().then((r) =>
      r?.pushManager.getSubscription().then((s) => setState(s ? "on" : "off")) ?? setState("off"),
    );
  }, []);

  const key = (b64: string) => {
    const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  };

  async function enable() {
    setBusy(true);
    setMsg("");
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setState("denied");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const res = await fetch("/api/push");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(d.publicKey) });
      await post("/api/push", { subscribe: sub.toJSON() });
      setState("on");
      setMsg("Zapnuto. Pošli si zkušební upozornění.");
    } catch (e: any) {
      setMsg(`Nepodařilo se: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await post("/api/push", { unsubscribe: sub.endpoint });
      await sub.unsubscribe();
    }
    setState("off");
    setMsg("");
  }
  async function test() {
    const d = await (await post("/api/push", { test: true })).json();
    setMsg(d.sent ? `Odesláno na ${d.sent} ${d.sent === 1 ? "zařízení" : "zařízení"}.` : "Žádné zařízení nepřijalo upozornění.");
  }

  return (
    <>
      <h3 className="sec">Upozornění na telefon</h3>
      <p className="note">
        Ráno ti dám vědět o nových zakázkách nad hlídaným skóre, 3 dny předem o lhůtě a o každé nové zakázce sledovaného
        zadavatele.
      </p>
      {!db ? (
        <p className="note">Upozornění potřebují databázi (Upstash).</p>
      ) : state === "unsupported" ? (
        <p className="note">
          {ios && !standalone
            ? "Na iPhonu fungují upozornění jen v appce z plochy: Sdílet → Přidat na plochu, pak to zapni tam."
            : "Tento prohlížeč upozornění nepodporuje."}
        </p>
      ) : state === "denied" ? (
        <p className="note">Upozornění máš v prohlížeči zakázaná. Povol je v nastavení prohlížeče u této stránky.</p>
      ) : state === "on" ? (
        <div className="row-btns">
          <span className="saved">
            <Icon n="check" size={14} /> Zapnuto na tomto zařízení
          </span>
          <button onClick={test}>Zkušební upozornění</button>
          <button className="ghost" onClick={disable}>
            Vypnout
          </button>
        </div>
      ) : (
        <button className="primary" onClick={enable} disabled={busy || state === "unknown"}>
          <Icon n="bell" size={16} /> Zapnout upozornění
        </button>
      )}
      {msg && <p className="note">{msg}</p>}
    </>
  );
}

function CalendarLink({ k }: { k: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof location !== "undefined" ? `${location.origin}/api/calendar/${k}.ics` : "";
  return (
    <>
      <p className="note">
        Lhůty zakázek, které zvažuješ, připravuješ nebo jsi podal, se samy objeví v tvém kalendáři, s připomenutím 3 dny
        předem.
      </p>
      <div className="row-btns">
        <button
          onClick={() =>
            navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
          }
        >
          <Icon n="calendar" size={16} /> {copied ? "Odkaz zkopírován" : "Kopírovat odkaz kalendáře"}
        </button>
        <a className="btn ghost-link" href={url.replace(/^https?:/, "webcal:")}>
          Přidat do Apple Kalendáře
        </a>
      </div>
      <p className="note">
        Google Kalendář: vlevo „Další kalendáře“ → + → „Z adresy URL“ → vlož odkaz. Odkaz je tajný, nikomu ho
        neposílej.
      </p>
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
