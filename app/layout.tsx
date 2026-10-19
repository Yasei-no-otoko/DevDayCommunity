import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../src/style.css";

export const metadata: Metadata = {
  title: "BLACKSITE — The Escape Experiment",
  description:
    "A 180-second horror experiment. Haunt the facility, obstruct AI-controlled Sam Altman, and contain his escape.",
};

export const viewport: Viewport = { themeColor: "#090e0e" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
