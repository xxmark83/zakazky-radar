import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });

export const metadata = { title: "Zakázky radar", description: "AI výběr veřejných zakázek" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* vzhled z Nastavení nastavit ještě před vykreslením, ať stránka neblikne */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("zr-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
