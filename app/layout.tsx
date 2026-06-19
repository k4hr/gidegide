import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DESTROY-ALGORITM — уроки по алгоритмам соцсетей",
  description:
    "Мини-уроки по Instagram, TikTok и YouTube Shorts. Разбери алгоритмы соцсетей и начни делать контент, который получает охваты.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
