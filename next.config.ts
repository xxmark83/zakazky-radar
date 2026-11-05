import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  // číslo verze v patičce a v Nastavení – při každém vydání zvýšit v package.json
  env: { APP_VERSION: pkg.version },
  // zakázky z profilů zadavatelů (plní GitHub Actions, scripts/crawl.mjs) čteme za běhu ze souboru
  outputFileTracingIncludes: { "/api/**": ["./data/profily.json"] },
};

export default nextConfig;
