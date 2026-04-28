"use client";

import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { getThemeClass } from "@/components/landing/landing-data";
import LessonTabs from "@/components/landing/LessonTabs";
import type { Lesson, Platform } from "@/components/landing/types";

type LessonsSectionProps = {
  activeLesson: Lesson;
  activeSlug: Platform;
  onChangeLesson: (slug: Platform) => void;
  onBuy: (lesson: Lesson) => void;
};

export default function LessonsSection({
  activeLesson,
  activeSlug,
  onChangeLesson,
  onBuy,
}: LessonsSectionProps) {
  return (
    <section id="lessons" className="lessons-block">
      <div className="container">
        <LessonTabs activeSlug={activeSlug} onChange={onChangeLesson} />

        <AnimatePresence mode="wait">
          <motion.div
            key={activeLesson.slug}
            className={`${getThemeClass(activeLesson.theme).card} product-card--single`}
            style={
              {
                "--lesson-bg": `url("${activeLesson.image}")`,
              } as CSSProperties
            }
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.24 }}
          >
            <div className="product-card-glow" />

            <div className="product-card-center">
              <button
                type="button"
                className="gold-btn buy-center-btn"
                onClick={() => onBuy(activeLesson)}
              >
                Купить урок за {activeLesson.price} ₽
                <ArrowRight size={20} />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
