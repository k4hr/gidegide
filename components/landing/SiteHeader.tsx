"use client";

import { Crown } from "lucide-react";

import type { Lesson } from "@/components/landing/types";

type SiteHeaderProps = {
  activeLesson: Lesson;
  onBuy: (lesson: Lesson) => void;
};

export default function SiteHeader({ activeLesson, onBuy }: SiteHeaderProps) {
  return (
    <header className="container header">
      <a href="#" className="brand">
        <div className="brand-icon">
          <Crown size={30} />
        </div>

        <div>
          <div className="brand-title">DESTROY</div>
          <div className="brand-subtitle">ALGORITM</div>
        </div>
      </a>

      <nav className="nav">
        <a href="#hero">Главная</a>
        <a href="#lessons">Уроки</a>
        <a href="#growth">Рост</a>
        <a href="#inside">Что внутри</a>
        <a href="#packages">Пакеты</a>
        <a href="#faq">FAQ</a>
      </nav>

      <button
        type="button"
        className="gold-btn header-btn"
        onClick={() => onBuy(activeLesson)}
      >
        Купить урок
      </button>
    </header>
  );
}
