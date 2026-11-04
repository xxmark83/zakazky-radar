import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // zakázky z profilů zadavatelů (plní GitHub Actions, scripts/crawl.mjs) čteme za běhu ze souboru
  outputFileTracingIncludes: { "/api/**": ["./data/profily.json"] },
};

export default nextConfig;
