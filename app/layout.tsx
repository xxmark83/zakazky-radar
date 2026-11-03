import "./globals.css";

export const metadata = { title: "Zakázky radar", description: "AI výběr veřejných zakázek" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
