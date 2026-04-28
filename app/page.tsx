"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Check,
  Crown,
  Instagram,
  LockKeyhole,
  Mail,
  Music2,
  Play,
  PlaySquare,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

type Platform = "instagram" | "tiktok" | "youtube-shorts";
type Theme = "instagram" | "tiktok" | "shorts";

type Lesson = {
  slug: Platform;
  theme: Theme;
  platformLabel: string;
  title: string;
  heroTitle: string;
  description: string;
  stat: string;
  statLabel: string;
  price: number;
  oldPrice: number;
  bullets: string[];
  icon: LucideIcon;
  accentText: string;
};

const lessons: Lesson[] = [
  {
    slug: "instagram",
    theme: "instagram",
    platformLabel: "Instagram",
    title: "Instagram Algorithm",
    heroTitle: "Продвижение в Instagram для роста охватов и заявок",
    description:
      "Разбор того, как Reels получают рекомендации, какие сигналы влияют на показы и как упаковать профиль под рост.",
    stat: "+128%",
    statLabel: "к охватам",
    price: 249,
    oldPrice: 990,
    bullets: [
      "Рост охватов",
      "Контент-стратегия",
      "Сценарии Reels",
      "Аналитика",
      "Упаковка профиля",
      "Воронка заявок",
    ],
    icon: Instagram,
    accentText: "Instagram • Reels • охваты",
  },
  {
    slug: "tiktok",
    theme: "tiktok",
    platformLabel: "TikTok",
    title: "TikTok Algorithm",
    heroTitle: "TikTok: вирусный контент и рост вовлечения",
    description:
      "Разбор удержания, первых секунд, досмотров, серийности роликов и механики попадания в рекомендации.",
    stat: "+215%",
    statLabel: "к вовлечению",
    price: 199,
    oldPrice: 790,
    bullets: [
      "Вирусный контент",
      "Первые 1–3 секунды",
      "Досмотры",
      "Серийный контент",
      "Тест гипотез",
      "Быстрый рост",
    ],
    icon: Music2,
    accentText: "TikTok • вирусность • вовлечение",
  },
  {
    slug: "youtube-shorts",
    theme: "shorts",
    platformLabel: "YouTube Shorts",
    title: "YouTube Shorts Algorithm",
    heroTitle: "YouTube Shorts: короткие видео с максимальным просмотром",
    description:
      "Разбор CTR, удержания, повторных просмотров, тематики канала и роста через короткие видео.",
    stat: "+184%",
    statLabel: "к просмотрам",
    price: 199,
    oldPrice: 790,
    bullets: [
      "Рост просмотров",
      "CTR и удержание",
      "Повторные просмотры",
      "Тематика канала",
      "Структура ролика",
      "Рост канала",
    ],
    icon: PlaySquare,
    accentText: "YouTube Shorts • показы • просмотры",
  },
];

const stats = [
  { value: "3", label: "платформы" },
  { value: "199 ₽", label: "старт урока" },
  { value: "0", label: "регистраций" },
  { value: "сразу", label: "доступ после покупки" },
];

const packages = [
  {
    title: "Instagram",
    price: "249 ₽",
    oldPrice: "990 ₽",
    desc: "Урок по Reels, охватам, упаковке профиля и заявкам.",
  },
  {
    title: "TikTok",
    price: "199 ₽",
    oldPrice: "790 ₽",
    desc: "Урок по вирусным роликам, удержанию и алгоритму рекомендаций.",
    hot: true,
  },
  {
    title: "YouTube Shorts",
    price: "199 ₽",
    oldPrice: "790 ₽",
    desc: "Урок по Shorts, CTR, удержанию и росту канала.",
  },
];

function getLesson(slug: Platform) {
  return lessons.find((item) => item.slug === slug) ?? lessons[0];
}

function themeClass(theme: Theme) {
  return {
    heroCard: `hero-card hero-card--${theme}`,
    tab: `tab tab--${theme}`,
    lessonPanel: `lesson-panel lesson-panel--${theme}`,
    lessonPhone: `lesson-phone lesson-phone--${theme}`,
    promoCard: `promo-card promo-card--${theme}`,
    miniVisual: `mini-visual mini-visual--${theme}`,
  };
}

export default function HomePage() {
  const [activeSlug, setActiveSlug] = useState<Platform>("instagram");
  const [checkoutLesson, setCheckoutLesson] = useState<Lesson | null>(null);
  const [email, setEmail] = useState("");
  const [isBuying, setIsBuying] = useState(false);
  const [error, setError] = useState("");

  const activeLesson = useMemo(() => getLesson(activeSlug), [activeSlug]);
  const sideLessons = useMemo(
    () => lessons.filter((item) => item.slug !== activeLesson.slug),
    [activeLesson.slug],
  );

  function openCheckout(lesson: Lesson) {
    setCheckoutLesson(lesson);
    setEmail("");
    setError("");
  }

  async function handleBuy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!checkoutLesson) return;

    setIsBuying(true);
    setError("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slug: checkoutLesson.slug,
          email,
        }),
      });

      const data = (await response.json()) as {
        accessUrl?: string;
        error?: string;
      };

      if (!response.ok || !data.accessUrl) {
        throw new Error(data.error ?? "Не получилось создать заказ");
      }

      window.location.href = data.accessUrl;
    } catch (buyError) {
      setError(
        buyError instanceof Error
          ? buyError.message
          : "Ошибка покупки. Попробуй ещё раз.",
      );
      setIsBuying(false);
    }
  }

  return (
    <main className="site-shell">
      <div className="page-glow" />

      <div className="browser-frame">
        <div className="browser-topbar">
          <div className="browser-dots">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
          </div>

          <div className="browser-nav-arrows">
            <span>‹</span>
            <span>›</span>
          </div>

          <div className="browser-address">
            <LockKeyhole size={14} />
            <span>destroy-algoritm.ru</span>
          </div>

          <div className="browser-close">×</div>
        </div>

        <div className="hero-surface">
          <header className="page-container header-row">
            <a href="#" className="brand">
              <div className="brand-mark">
                <Crown size={28} />
              </div>

              <div className="brand-copy">
                <div className="brand-title">DESTROY</div>
                <div className="brand-subtitle">ALGORITM</div>
              </div>
            </a>

            <nav className="main-nav">
              <a href="#hero">Главная</a>
              <a href="#lessons">Уроки</a>
              <a href="#inside">Что внутри</a>
              <a href="#packages">Пакеты</a>
              <a href="#faq">FAQ</a>
            </nav>

            <button
              type="button"
              className="gold-button compact"
              onClick={() => openCheckout(activeLesson)}
            >
              Купить урок
            </button>
          </header>

          <section id="hero" className="page-container hero-grid">
            <motion.div
              className="hero-left"
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
            >
              <div className="hero-chip">
                <Sparkles size={16} />
                <span>Мини-уроки по алгоритмам соцсетей</span>
              </div>

              <h1 className="hero-title">
                АЛГОРИТМЫ
                <br />
                СОЦСЕТЕЙ
              </h1>

              <div className="hero-platforms">
                Instagram • TikTok • YouTube Shorts
              </div>

              <p className="hero-description">
                Показываем, как соцсети раздают охваты, вовлечение и просмотры —
                без воды, коротко и по делу.
              </p>

              <div className="hero-badges">
                <div className="hero-badge">
                  <LockKeyhole size={18} />
                  Без регистрации
                </div>
                <div className="hero-badge">
                  <Zap size={18} />
                  Доступ сразу
                </div>
                <div className="hero-badge">
                  <BadgeCheck size={18} />
                  От 199 ₽
                </div>
              </div>

              <div className="hero-actions">
                <a href="#lessons" className="gold-button">
                  Выбрать урок
                  <ArrowRight size={18} />
                </a>

                <a href="#inside" className="dark-button">
                  Что внутри
                  <Play size={18} />
                </a>
              </div>
            </motion.div>

            <motion.div
              className="hero-right"
              initial={{ opacity: 0, scale: 0.95, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              <div className="hero-orbit" />

              <div className="hero-cards">
                {lessons.map((lesson, index) => {
                  const ui = themeClass(lesson.theme);
                  const Icon = lesson.icon;

                  return (
                    <button
                      key={lesson.slug}
                      type="button"
                      className={`hero-card-wrap ${
                        index === 0
                          ? "hero-card-wrap--left"
                          : index === 1
                            ? "hero-card-wrap--center"
                            : "hero-card-wrap--right"
                      }`}
                      onClick={() => setActiveSlug(lesson.slug)}
                    >
                      <div className="hero-card-wings" />

                      <div className={ui.heroCard}>
                        <div className="hero-card-float-badge" />
                        <div className="hero-card-float-badge hero-card-float-badge--second" />

                        <div className="hero-card-icon-shell">
                          <Icon className="hero-card-icon" />
                        </div>

                        <div className="hero-card-title">
                          {lesson.platformLabel}
                        </div>

                        <div className="hero-card-metric">
                          <div>
                            <div className="hero-card-metric-value">
                              {lesson.stat}
                            </div>
                            <div className="hero-card-metric-label">
                              {lesson.statLabel}
                            </div>
                          </div>

                          <BarChart3 className="hero-card-chart" />
                        </div>
                      </div>

                      <div className="hero-card-pedestal" />
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </section>

          <section id="lessons" className="page-container lessons-section">
            <div className="tabs-row">
              {lessons.map((lesson) => {
                const ui = themeClass(lesson.theme);
                const Icon = lesson.icon;

                return (
                  <button
                    key={lesson.slug}
                    type="button"
                    className={`${ui.tab} ${
                      activeLesson.slug === lesson.slug ? "is-active" : ""
                    }`}
                    onClick={() => setActiveSlug(lesson.slug)}
                  >
                    <div className="tab-inner">
                      <div className="tab-icon-shell">
                        <Icon className="tab-icon" />
                      </div>

                      <div>
                        <div className="tab-title">{lesson.platformLabel}</div>
                        <div className="tab-subtitle">
                          {lesson.price} ₽ вместо {lesson.oldPrice} ₽
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="lessons-grid">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeLesson.slug}
                  className={themeClass(activeLesson.theme).lessonPanel}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -14 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="lesson-panel-glow" />

                  <div className="lesson-panel-content">
                    <div>
                      <div className="section-chip">
                        <Sparkles size={15} />
                        <span>Закрытый урок</span>
                      </div>

                      <h2 className="lesson-title">{activeLesson.heroTitle}</h2>

                      <p className="lesson-description">
                        {activeLesson.description}
                      </p>

                      <div className="lesson-bullets">
                        {activeLesson.bullets.map((bullet) => (
                          <div key={bullet} className="lesson-bullet">
                            <span className="lesson-bullet-icon">
                              <Check size={14} />
                            </span>
                            <span>{bullet}</span>
                          </div>
                        ))}
                      </div>

                      <div className="lesson-actions">
                        <button
                          type="button"
                          className="gold-button"
                          onClick={() => openCheckout(activeLesson)}
                        >
                          Купить за {activeLesson.price} ₽
                          <ArrowRight size={18} />
                        </button>

                        <a href="#inside" className="dark-button">
                          Что внутри
                          <Play size={18} />
                        </a>
                      </div>
                    </div>

                    <div className="lesson-preview-area">
                      <div className={themeClass(activeLesson.theme).lessonPhone}>
                        <div className="lesson-phone-top">
                          <span>{activeLesson.platformLabel}</span>
                          <span>12.6K</span>
                        </div>

                        <div className="lesson-phone-stat">
                          <div className="lesson-phone-stat-label">
                            Рост метрик
                          </div>
                          <div className="lesson-phone-stat-value">
                            {activeLesson.stat}
                          </div>
                          <div className="lesson-phone-stat-sub">
                            {activeLesson.statLabel}
                          </div>
                        </div>

                        <div className="lesson-phone-line" />

                        <div className="lesson-phone-bars">
                          {[56, 84, 72, 118, 156].map((height, index) => (
                            <div
                              key={index}
                              className="lesson-phone-bar"
                              style={{ height }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="promo-cards-column">
                {sideLessons.map((lesson) => {
                  const ui = themeClass(lesson.theme);
                  const Icon = lesson.icon;

                  return (
                    <button
                      key={lesson.slug}
                      type="button"
                      className={ui.promoCard}
                      onClick={() => setActiveSlug(lesson.slug)}
                    >
                      <div className="promo-card-glow" />

                      <div className="promo-card-title">
                        {lesson.platformLabel}
                      </div>

                      <div className="promo-card-text">{lesson.accentText}</div>

                      <div className={ui.miniVisual}>
                        <div className="mini-visual-icon-shell">
                          <Icon className="mini-visual-icon" />
                        </div>

                        <div className="mini-visual-bars">
                          {[36, 62, 50, 82, 112].map((height, index) => (
                            <div
                              key={index}
                              className="mini-visual-bar"
                              style={{ height }}
                            />
                          ))}
                        </div>

                        <TrendingUp className="mini-visual-trend" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>

      <section id="inside" className="page-container content-section">
        <div className="content-panel">
          <div className="section-chip">
            <ShieldCheck size={15} />
            <span>Что получает покупатель</span>
          </div>

          <h2 className="section-title">Закрытая статья без воды</h2>

          <p className="section-description">
            После покупки открывается уникальная ссылка на материал. Пользователю
            не нужен аккаунт, пароль или личный кабинет — только email и сразу
            доступ.
          </p>

          <div className="info-grid">
            <div className="info-card">
              <div className="info-card-num">01</div>
              <div className="info-card-title">
                Как платформа тестирует контент
              </div>
              <p className="info-card-text">
                Поймёшь, почему один ролик получает показы, а другой умирает на
                старте.
              </p>
            </div>

            <div className="info-card">
              <div className="info-card-num">02</div>
              <div className="info-card-title">
                Какие метрики реально важны
              </div>
              <p className="info-card-text">
                Удержание, досмотры, реакции, CTR, свайпы, повторные просмотры и
                другие сигналы.
              </p>
            </div>

            <div className="info-card">
              <div className="info-card-num">03</div>
              <div className="info-card-title">Как делать контент системно</div>
              <p className="info-card-text">
                Получишь понятную схему: форматы, серии, темы, ошибки и логика
                масштабирования.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="packages" className="page-container content-section">
        <div className="content-panel">
          <div className="section-chip">
            <Sparkles size={15} />
            <span>Пакеты уроков</span>
          </div>

          <h2 className="section-title">Выбери свой разбор</h2>

          <p className="section-description">
            Сейчас продаём отдельные мини-уроки по каждой платформе. Потом
            можно добавить общий комплект.
          </p>

          <div className="package-grid">
            {packages.map((pack) => (
              <div
                key={pack.title}
                className={`package-card ${pack.hot ? "package-card--hot" : ""}`}
              >
                {pack.hot ? <div className="package-hot">Хит</div> : null}

                <div className="package-title">{pack.title}</div>
                <div className="package-price">{pack.price}</div>
                <div className="package-old-price">{pack.oldPrice}</div>
                <p className="package-description">{pack.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="page-container content-section">
        <div className="content-panel">
          <div className="stats-grid">
            {stats.map((item) => (
              <div key={item.label} className="stat-card">
                <div className="stat-value">{item.value}</div>
                <div className="stat-label">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="page-container content-section content-section--last">
        <div className="content-panel">
          <div className="section-chip">
            <BadgeCheck size={15} />
            <span>FAQ</span>
          </div>

          <h2 className="section-title">Частые вопросы</h2>

          <div className="info-grid">
            <div className="info-card">
              <div className="info-card-title">Нужна регистрация?</div>
              <p className="info-card-text">
                Нет. Покупатель просто выбирает урок, вводит email и получает
                ссылку доступа.
              </p>
            </div>

            <div className="info-card">
              <div className="info-card-title">Это про накрутку?</div>
              <p className="info-card-text">
                Нет. Это обучающие материалы про механику рекомендаций, контент,
                удержание и аналитику.
              </p>
            </div>

            <div className="info-card">
              <div className="info-card-title">Что открывается после оплаты?</div>
              <p className="info-card-text">
                Закрытая статья по уникальной ссылке в формате /access/токен.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        DESTROY ALGORITM © 2026 · Уроки по алгоритмам соцсетей
      </footer>

      <AnimatePresence>
        {checkoutLesson ? (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setCheckoutLesson(null);
              }
            }}
          >
            <motion.div
              className="modal-card"
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.2 }}
            >
              <button
                type="button"
                className="modal-close-button"
                onClick={() => setCheckoutLesson(null)}
              >
                <X size={18} />
              </button>

              <div className="modal-icon-shell">
                <checkoutLesson.icon className="modal-icon" />
              </div>

              <h3 className="modal-title">{checkoutLesson.title}</h3>

              <p className="modal-text">
                Введи email. Сейчас в MVP доступ откроется сразу. Потом сюда
                подключим оплату и автоматическую выдачу доступа.
              </p>

              <div className="modal-price-box">
                <div>
                  <div className="modal-price-label">Стоимость урока</div>
                  <div className="modal-price-value">
                    {checkoutLesson.price} ₽
                  </div>
                </div>

                <div className="modal-old-price">
                  вместо <span>{checkoutLesson.oldPrice} ₽</span>
                </div>
              </div>

              <form onSubmit={handleBuy}>
                <label className="modal-input-label">Email для доступа</label>

                <div className="modal-input-wrap">
                  <Mail className="modal-input-icon" />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="example@mail.com"
                    className="modal-input"
                  />
                </div>

                {error ? <div className="modal-error">{error}</div> : null}

                <button disabled={isBuying} type="submit" className="gold-button modal-submit">
                  {isBuying ? "Открываем доступ..." : "Получить доступ"}
                  <ArrowRight size={18} />
                </button>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
