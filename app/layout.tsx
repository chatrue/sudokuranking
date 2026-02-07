import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SuDoKu ranking",
  description: "PWA Sudoku ranking app",
  manifest: "/manifest.json",
 };
export const viewport = {
  themeColor: "#0F172A",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SuDoKu" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
