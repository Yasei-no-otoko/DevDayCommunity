import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../src/style.css";

export const metadata: Metadata = {
  title: "BLACKSITE — The Escape Experiment",
  description:
    "AIが操作するサム・アルトマンの脱出を妨害する180秒のホラー実験。追尾するぬこぬこさんと、使用間隔をリセットするTiboが登場。",
};

export const viewport: Viewport = { themeColor: "#090e0e" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
