"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  LockKeyhole,
  Play,
  Sparkles,
  Zap,
} from "lucide-react";

import SiteHeader from "@/components/landing/SiteHeader";
import type { Lesson } from "@/components/landing/types";

type HeroSectionProps = {
  activeLesson: Lesson;
  onBuy: (lesson: Lesson) => void;
};

export default function HeroSection({ activeLesson, onBuy }: HeroSectionProps) {
  return (
    <section id="hero" className="art-hero">
      <div className="art-hero-bg" />

      <SiteHeader activeLesson={activeLesson} onBuy={onBuy} />

      <div className="container hero-overlay">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <div className="hero-pill">
            <Sparkles size={16} />
            Мини-уроки по алгоритмам соцсетей
          </div>

          <h1 className="hero-title">
            ПРОДВИЖЕНИЕ
            <span>В СОЦСЕТЯХ</span>
          </h1>

          <div className="hero-platforms">
            Instagram • TikTok • YouTube Shorts
          </div>

          <p className="hero-text">
            Показываем, как соцсети раздают охваты, вовлечение и просмотры.
            Короткие уроки без регистрации и лишней воды.
          </p>

          <div className="hero-benefits">
            <div className="hero-benefit">
              <LockKeyhole size={18} />
              Без регистрации
            </div>

            <div className="hero-benefit">
              <Zap size={18} />
              Доступ сразу
            </div>

            <div className="hero-benefit">
              <BadgeCheck size={18} />
              От 199 ₽
            </div>
          </div>

          <div className="hero-buttons">
            <a href="#lessons" className="gold-btn">
              Выбрать урок
              <ArrowRight size={18} />
            </a>

            <a href="#growth" className="dark-btn">
              Смотреть рост
              <Play size={18} />
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
