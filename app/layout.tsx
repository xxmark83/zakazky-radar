import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });

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
    <html lang="cs" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* vzhled z Nastavení nastavit ještě před vykreslením, ať stránka neblikne */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("zr-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}if("serviceWorker"in navigator&&location.hostname!=="localhost")addEventListener("load",function(){navigator.serviceWorker.register("/sw.js")})`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
