// Kraje ČR pro filtr. Kraj zadavatele určuje AI spolu se skóre (z názvu a sídla zadavatele).
export const REGIONS = [
  "Praha",
  "Středočeský",
  "Jihočeský",
  "Plzeňský",
  "Karlovarský",
  "Ústecký",
  "Liberecký",
  "Královéhradecký",
  "Pardubický",
  "Vysočina",
  "Jihomoravský",
  "Olomoucký",
  "Zlínský",
  "Moravskoslezský",
  "celostátní",
  "Slovensko",
  "neznámý",
] as const;
export type Region = (typeof REGIONS)[number];
