import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Завод контента — VK Super Upload",
  description:
    "Панель автоматизации коротких роликов: VK-группы, нарезка, русские названия, публикация в YouTube Shorts и TikTok.",
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
