"use client";

import type { CSSProperties } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

import { getThemeClass, lessons } from "@/components/landing/landing-data";
import type { Lesson } from "@/components/landing/types";

type GrowthSectionProps = {
  onBuy: (lesson: Lesson) => void;
};

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
          Ниже три больших визуальных блока. Меняешь картинки в папке
          lesson-images — и фон сразу обновляется на сайте.
        </p>
      </div>

      <div className="growth-showcase-grid">
        {lessons.map((lesson) => (
          <button
            key={lesson.slug}
            type="button"
            className={getThemeClass(lesson.theme).growth}
            style={
              {
                "--growth-bg": `url("${lesson.image}")`,
              } as CSSProperties
            }
            onClick={() => onBuy(lesson)}
          >
            <div className="growth-card-center">
              <span className="gold-btn buy-center-btn">
                Купить урок за {lesson.price} ₽
                <ArrowRight size={20} />
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
