export type Tender = {
  id: string;
  source: "TED" | "NEN" | "Hlídač státu" | "Profily zadavatelů";
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
  source?: "TED" | "ISVZ";
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
};

export type Draft = { outline: { heading: string; points: string[] }[]; coverLetter: string };

export type Change = { field: "deadline" | "title" | "value" | "description"; from: string; to: string; at: string };
