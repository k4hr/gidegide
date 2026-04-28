"use client";

import type { CSSProperties } from "react";
import { Sparkles } from "lucide-react";

import { lessons } from "@/components/landing/landing-data";
import type { Lesson } from "@/components/landing/types";

type GrowthSectionProps = {
  onBuy?: (lesson: Lesson) => void;
};

const growthImages: Record<Lesson["slug"], string> = {
  instagram: "/lesson-images/instagram-growth-bg.png",
  tiktok: "/lesson-images/tiktok-growth-bg.png",
  "youtube-shorts": "/lesson-images/youtube-shorts-growth-bg.png",
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

        <h2 className="section-title">Выбери направление роста</h2>

        <p className="section-text">
          Эти блоки можно использовать под отдельные продающие изображения:
          охваты, просмотры, вовлечение, комментарии, лайки и подписчики.
        </p>
      </div>

      <div className="growth-showcase-grid">
        {lessons.map((lesson) => (
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
            <div className="growth-card-center" />
          </div>
        ))}
      </div>
    </section>
  );
}
