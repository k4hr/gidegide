"use client";

import { getThemeClass, lessons } from "@/components/landing/landing-data";
import type { Platform } from "@/components/landing/types";

type LessonTabsProps = {
  activeSlug: Platform;
  onChange: (slug: Platform) => void;
};

export default function LessonTabs({ activeSlug, onChange }: LessonTabsProps) {
  return (
    <div className="tabs-row">
      {lessons.map((lesson) => {
        const Icon = lesson.icon;
        const ui = getThemeClass(lesson.theme);

        return (
          <button
            key={lesson.slug}
            type="button"
            className={`${ui.tab} ${
              activeSlug === lesson.slug ? "is-active" : ""
            }`}
            onClick={() => onChange(lesson.slug)}
          >
            <div className="tab-icon">
              <Icon size={26} />
            </div>

            <div>
              <div className="tab-title">{lesson.platformLabel}</div>
              <div className="tab-price">
                {lesson.price} ₽ вместо {lesson.oldPrice} ₽
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
