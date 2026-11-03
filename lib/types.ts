export type Tender = {
  id: string;
  source: "TED" | "Hlídač státu";
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

export type SearchRequest = {
  profile: string; // volný popis, co nabízím
  keywords: string; // slova oddělená čárkou – použijí se v Hlídači státu
  cpv: string; // CPV kódy oddělené čárkou/mezerou
  days: number; // jak staré zveřejnění brát
  minScore: number;
};
