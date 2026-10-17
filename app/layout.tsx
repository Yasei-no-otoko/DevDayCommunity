import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../src/style.css";

export const metadata: Metadata = {
  title: "BLACKSITE — The Escape Experiment",
  description:
    "AIは脱出を目指す。あなたは、その場所に棲む存在。停電や囁きでELIASの脱出を阻む、180秒のホラー実験。",
};

export const viewport: Viewport = { themeColor: "#090e0e" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
