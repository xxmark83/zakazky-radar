export type Tender = {
  id: string;
  source: "TED" | "NEN" | "Hlídač státu" | "Profily zadavatelů";
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
};

export type Profile = {
  name: string;
  profile: string; // volný popis, co nabízím
  keywords: string; // slova oddělená čárkou
  cpv: string; // CPV kódy oddělené čárkou/mezerou
};

export type SearchRequest = Profile & {
  mode: "open" | "upcoming";
  days: number; // jak staré zveřejnění brát
  minScore: number;
};

export type WatchedProfile = Profile & { minScore: number; watch: boolean };

export type Status = "new" | "maybe" | "bid" | "no";
