import type { LucideIcon } from "lucide-react";

export type Platform = "instagram" | "tiktok" | "youtube-shorts";
export type Theme = "instagram" | "tiktok" | "youtube";

export type Lesson = {
  slug: Platform;
  theme: Theme;
  title: string;
  platformLabel: string;
  subtitle: string;
  description: string;
  price: number;
  oldPrice: number;
  image: string;
  icon: LucideIcon;
};

export type StatItem = {
  value: string;
  label: string;
};

export type ThemeClasses = {
  tab: string;
  card: string;
  package: string;
  growth: string;
};
