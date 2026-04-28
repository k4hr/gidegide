"use client";

import { Sparkles } from "lucide-react";

import { getThemeClass, lessons } from "@/components/landing/landing-data";
import type { Lesson } from "@/components/landing/types";

type PackagesSectionProps = {
  onBuy: (lesson: Lesson) => void;
};

export default function PackagesSection({ onBuy }: PackagesSectionProps) {
  return (
    <section id="packages" className="container content-section">
      <div className="content-panel">
        <div className="section-label">
          <Sparkles size={16} />
          Пакеты уроков
        </div>

        <h2 className="section-title">Выбери свой разбор</h2>

        <p className="section-text">
          Отдельные мини-уроки по каждой платформе. Позже можно добавить общий
          комплект из всех трёх.
        </p>

        <div className="package-grid">
          {lessons.map((lesson) => (
            <button
              key={lesson.slug}
              type="button"
              className={getThemeClass(lesson.theme).package}
              onClick={() => onBuy(lesson)}
            >
              {lesson.slug === "tiktok" ? (
                <div className="package-hit">Хит</div>
              ) : null}

              <div className="package-title">{lesson.platformLabel}</div>
              <div className="package-price">{lesson.price} ₽</div>
              <div className="package-old">{lesson.oldPrice} ₽</div>
              <p>{lesson.description}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
