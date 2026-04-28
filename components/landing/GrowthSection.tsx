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
    accent: string;
  }
> = {
  instagram: {
    eyebrow: "Instagram Algorithm",
    title: "ЗАБЕРИ ОХВАТЫ, КОТОРЫЕ УПУСКАЮТ ДРУГИЕ",
    text: "Разбери, какие сигналы Instagram реально считывает в Reels: удержание, реакции, сохранения, комментарии и упаковку профиля. Не гадай — делай контент, который алгоритм хочет показывать.",
    bullets: [
      "Больше охватов",
      "Больше реакций",
      "Больше заявок",
      "Сильная упаковка",
    ],
    accent: "Reels / охваты / заявки",
  },
  tiktok: {
    eyebrow: "TikTok Algorithm",
    title: "ЗАЛЕТАЙ В РЕКОМЕНДАЦИИ, А НЕ В ПУСТОТУ",
    text: "TikTok не продвигает случайно. Он смотрит на первые секунды, досмотры, повторы, вовлечение и сериальность. Пойми механику — и перестань сливать ролики без результата.",
    bullets: [
      "Выход в рекомендации",
      "Досмотры роликов",
      "Вирусные форматы",
      "Рост вовлечения",
    ],
    accent: "For You / удержание / вирусность",
  },
  "youtube-shorts": {
    eyebrow: "YouTube Shorts Algorithm",
    title: "ПРЕВРАТИ SHORTS В МАШИНУ ПРОСМОТРОВ",
    text: "YouTube Shorts продвигает то, что удерживает внимание. Разбери CTR, свайпы, повторные просмотры, тематику канала и структуру короткого видео, чтобы ролики получали больше показов.",
    bullets: [
      "Больше просмотров",
      "Выше удержание",
      "Сильнее CTR",
      "Рост канала",
    ],
    accent: "Shorts / просмотры / рост",
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
          Три отдельных разбора под разные алгоритмы: Instagram, TikTok и
          YouTube Shorts. Каждый блок — про рост охватов, просмотров,
          вовлечения и заявок через контент.
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

                <div className="growth-card-accent">{copy.accent}</div>

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
