import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  // číslo verze v patičce a v Nastavení – při každém vydání zvýšit v package.json
  env: { APP_VERSION: pkg.version },
  // zakázky z profilů zadavatelů (plní GitHub Actions, scripts/crawl.mjs) čteme za běhu ze souboru
  outputFileTracingIncludes: { "/api/**": ["./data/profily.json", "./data/vhodne.json", "./data/isvz-vysledky.json", "./data/isvz-dns.json", "./data/smlouvy-it.json"] },
  // bezpečnostní hlavičky: žádné vkládání do cizích rámů, skripty a data jen z vlastní domény,
  // žádný přístup ke kameře/mikrofonu/poloze. Inline skripty potřebuje Next.js a nastavení vzhledu.
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "worker-src 'self'",
      "manifest-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
