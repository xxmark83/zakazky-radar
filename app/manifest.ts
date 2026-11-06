import type { MetadataRoute } from "next";

// PWA: „Přidat na plochu“ otevře appku přes celou obrazovku bez lišty prohlížeče
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zakázky radar",
    short_name: "Zakázky",
    description: "AI výběr veřejných zakázek",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0c0e14",
    theme_color: "#0c0e14",
    lang: "cs",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
