import type { Metadata } from "next";
import { siteAsset } from "@/lib/site-url";
import "./geist-fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "考察箱",
  description: "作業中や寝る前に聞ける、雨と夜の知的ラジオ。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className="kousatsu-fonts h-full antialiased"
    >
      <head>
        <link rel="preload" href={siteAsset("/fonts/geist/605ce01b664af129-s.p.0wgildi0cnwt9.woff2")} as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href={siteAsset("/fonts/geist/07a39a8a4660cc7c-s.p.0r6juujl39pe6.woff2")} as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
