"use client";

import type { CSSProperties } from "react";
import { Sparkles } from "lucide-react";

import { lessons } from "@/components/landing/landing-data";
import type { Lesson } from "@/components/landing/types";

type GrowthSectionProps = {
  onBuy?: (lesson: Lesson) => void;
};

const growthImages: Record<Lesson["slug"], string> = {
  instagram: "/lesson-images/instagram-growth.png",
  tiktok: "/lesson-images/tiktok-growth.png",
  "youtube-shorts": "/lesson-images/youtube-shorts-growth.png",
};

const growthCopy: Record<
  Lesson["slug"],
  {
    eyebrow: string;
    title: string;
    text: string;
    bullets: string[];
  }
> = {
  instagram: {
    eyebrow: "Instagram growth",
    title: "ОХВАТЫ, ЛАЙКИ И КОММЕНТАРИИ",
    text: "Пойми, как Instagram двигает Reels в рекомендации, какие сигналы реально поднимают охваты и как выжимать максимум из каждого ролика.",
    bullets: [
      "Рост охватов",
      "Больше лайков",
      "Больше комментариев",
    ],
  },
  tiktok: {
    eyebrow: "TikTok growth",
    title: "ВЫХОД В РЕКОМЕНДАЦИИ",
    text: "Разберись, как TikTok оценивает удержание, досмотры и первые секунды ролика, чтобы чаще залетать в рекомендации и набирать просмотры.",
    bullets: [
      "Вирусные просмотры",
      "Рост вовлечения",
      "Сильное удержание",
    ],
  },
  "youtube-shorts": {
    eyebrow: "YouTube Shorts growth",
    title: "ПРОСМОТРЫ И РОСТ SHORTS",
    text: "Узнай, как повышать CTR, удержание и повторные просмотры, чтобы Shorts чаще пушились алгоритмом и приносили стабильный рост канала.",
    bullets: [
      "Больше просмотров",
      "Выше CTR",
      "Рост канала",
    ],
  },
};

function getGrowthClass(theme: Lesson["theme"]) {
  return `growth-card growth-card--${theme}`;
}

export default function GrowthSection({ onBuy }: GrowthSectionProps) {
  return (
    <section id="growth" className="container growth-showcase-section">
      <div className="growth-showcase-head">
        <div className="section-label">
          <Sparkles size={16} />
          Рост по платформам
        </div>

        <h2 className="section-title">ВЫБЕРИ НАПРАВЛЕНИЕ РОСТА</h2>

        <p className="section-text">
          Эти блоки можно использовать под отдельные продающие изображения:
          охваты, просмотры, вовлечение, комментарии, лайки и подписчики.
        </p>
      </div>

      <div className="growth-showcase-grid">
        {lessons.map((lesson) => {
          const copy = growthCopy[lesson.slug];

          return (
            <div
              key={lesson.slug}
              className={getGrowthClass(lesson.theme)}
              style={
                {
                  "--growth-bg": `url("${growthImages[lesson.slug]}")`,
                } as CSSProperties
              }
              onClick={() => onBuy?.(lesson)}
              role={onBuy ? "button" : undefined}
              tabIndex={onBuy ? 0 : undefined}
              onKeyDown={(event) => {
                if (!onBuy) return;

                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onBuy(lesson);
                }
              }}
            >
              <div className="growth-card-overlay" />

              <div className="growth-card-content">
                <div className="growth-card-eyebrow">{copy.eyebrow}</div>

                <h3 className="growth-card-title">{copy.title}</h3>

                <p className="growth-card-text">{copy.text}</p>

                <div className="growth-card-bullets">
                  {copy.bullets.map((item) => (
                    <div key={item} className="growth-card-bullet">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
