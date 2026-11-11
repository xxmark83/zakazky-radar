export type Tender = {
  id: string;
  source: "TED" | "NEN" | "Hlídač státu" | "Profily zadavatelů" | "DNS";
  country?: "CZ" | "SK"; // chybí = Česko
  region?: string; // kraj z oficiálních dat (TED); jinak ho určí AI
  kind: "open" | "upcoming"; // otevřená výzva / připravovaná (PIN, tržní konzultace)
  title: string;
  buyer: string;
  published: string | null;
  deadline: string | null;
  value: number | null;
  currency: string | null;
  cpv: string[];
  description: string;
  url: string;
};

export type ScoredTender = Tender & {
  score: number; // 0–100
  reason: string;
  product: string; // který z mých produktů sedí
};

export type Award = {
  id: string;
  title: string;
  buyer: string;
  published: string | null;
  winners: string[];
  value: number | null;
  currency: string | null;
  cpv: string[];
  url: string;
  source?: "TED" | "ISVZ" | "Smlouvy";
  offers?: number | null; // počet podaných nabídek (jen ISVZ)
};

export type Profile = {
  name: string;
  profile: string; // volný popis, co nabízím
  keywords: string; // slova oddělená čárkou
  cpv: string; // CPV kódy oddělené čárkou/mezerou
};

export type Score = Pick<ScoredTender, "score" | "product" | "reason" | "region">;

export type SearchRequest = Profile & {
  mode: "open" | "upcoming";
  days: number; // jak staré zveřejnění brát
  minScore: number;
  known?: Record<string, Score>; // skóre z minulých hledání se stejným profilem – AI je nehodnotí znovu
  model?: "opus" | "haiku";
  noAi?: boolean; // měsíční limit vyčerpán – jen nové zakázky bez hodnocení
  slovakia?: boolean; // přidat slovenské zakázky (zatím TED)
};

export type WatchedProfile = Profile & { minScore: number; watch: boolean };

// maybe = zvažuji, bid = připravuji nabídku, sent = podáno, won/lost = výsledek
export type Status = "new" | "maybe" | "bid" | "sent" | "won" | "lost" | "no";

export type Analysis = {
  summary: string;
  requirements: string[];
  risks: string[];
  verdict: "go" | "consider" | "skip";
  verdictReason: string;
  offer: string;
  questions: string[];
  checklist?: string[]; // co připravit do nabídky (doklady, přílohy, kroky)
  criteria?: string[]; // hodnoticí kritéria a jejich váhy
  sources?: string[]; // přečtené dokumenty (doplní server)
  questionsDeadline?: string; // poslední den na dotazy, je-li v dokumentaci
};

export type Checks = { done: Record<string, boolean>; extra: string[] };
export type Outcome = { winner: string; price: number | null; ourPrice: number | null; note: string; date: string };

export type Draft = { outline: { heading: string; points: string[] }[]; coverLetter: string; references?: string[] };

export type Change = { field: "deadline" | "title" | "value" | "description"; from: string; to: string; at: string };

// historie zadavatele v detailu zakázky (lib/buyer.ts)
export type Contract = {
  id: string;
  title: string;
  suppliers: string[];
  value: number | null; // Kč bez DPH
  date: string | null; // podpis smlouvy / zadání zakázky
  url: string;
  source: "Hlídač státu" | "Registr smluv" | "ISVZ";
  it: boolean;
  related: number; // kolik slov se shoduje s otevřenou zakázkou (slova z názvu váží dvojnásob)
  matched: string[];
  offers?: number | null;
};

export type BuyerHistory = {
  buyer: { ico: string | null; name: string; via: string; query: string };
  full: boolean; // celý Registr smluv přes Hlídač státu (s tokenem), jinak jen naše IT smlouvy
  years: number;
  warnings: string[];
  items: Contract[];
};

export type BuyerAi = {
  summary: string;
  incumbent: string;
  prices: string;
  items: { id: string; relevance: number; note: string }[];
};
