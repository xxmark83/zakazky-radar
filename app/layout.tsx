import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "@fontsource/big-shoulders/700.css";
import "@fontsource/big-shoulders/800.css";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/public-sans/700.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });
// nadpisy a velká čísla: výraznější grotesk, text zůstává v Inter
const display = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], variable: "--font-display" });

export const metadata: Metadata = {
  title: "Zakázky radar",
  description: "AI výběr veřejných zakázek",
  // iPhone: appka z plochy přes celou obrazovku, vlastní název a ikona
  appleWebApp: { capable: true, title: "Zakázky", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0e14" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" className={`${inter.variable} ${display.variable}`} suppressHydrationWarning>
      <head>
        {/* vzhled z Nastavení nastavit ještě před vykreslením, ať stránka neblikne */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("zr-theme")||"space-dark";if(t==="light"||t==="dark"||t==="space-dark"||t==="space-light"){document.documentElement.dataset.theme=t;if(t.indexOf("space")===0)document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=t==="space-dark"?"#050608":"#F1F2EF"})}}catch(e){}if("serviceWorker"in navigator&&location.hostname!=="localhost")addEventListener("load",function(){navigator.serviceWorker.register("/sw.js")})`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
