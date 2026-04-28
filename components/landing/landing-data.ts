import { Instagram, Music2, PlaySquare } from "lucide-react";

import type {
  Lesson,
  Platform,
  StatItem,
  Theme,
  ThemeClasses,
} from "@/components/landing/types";

export const lessons: Lesson[] = [
  {
    slug: "instagram",
    theme: "instagram",
    title: "Instagram Algorithm",
    platformLabel: "Instagram",
    subtitle: "Как Reels получают охваты",
    description:
      "Разбор того, как Instagram оценивает Reels, какие сигналы влияют на рекомендации и как упаковать профиль под рост.",
    price: 249,
    oldPrice: 990,
    image: "/lesson-images/instagram-promo.png",
    icon: Instagram,
  },
  {
    slug: "tiktok",
    theme: "tiktok",
    title: "TikTok Algorithm",
    platformLabel: "TikTok",
    subtitle: "Как попасть в рекомендации",
    description:
      "Разбор удержания, первых секунд, досмотров, серийности роликов и механики попадания в рекомендации.",
    price: 199,
    oldPrice: 790,
    image: "/lesson-images/tiktok-promo.png",
    icon: Music2,
  },
  {
    slug: "youtube-shorts",
    theme: "youtube",
    title: "YouTube Shorts Algorithm",
    platformLabel: "YouTube Shorts",
    subtitle: "Как Shorts получают просмотры",
    description:
      "Разбор CTR, удержания, повторных просмотров, тематики канала и роста через короткие видео.",
    price: 199,
    oldPrice: 790,
    image: "/lesson-images/youtube-shorts-promo.png",
    icon: PlaySquare,
  },
];

export const stats: StatItem[] = [
  {
    value: "3",
    label: "платформы",
  },
  {
    value: "199 ₽",
    label: "старт урока",
  },
  {
    value: "0",
    label: "регистраций",
  },
  {
    value: "сразу",
    label: "доступ после покупки",
  },
];

export function getLesson(slug: Platform) {
  return lessons.find((lesson) => lesson.slug === slug) ?? lessons[0];
}

export function getThemeClass(theme: Theme): ThemeClasses {
  return {
    tab: `product-tab product-tab--${theme}`,
    card: `product-card product-card--${theme}`,
    package: `package-card package-card--${theme}`,
    growth: `growth-card growth-card--${theme}`,
  };
}
