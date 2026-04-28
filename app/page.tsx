"use client";

import type { CSSProperties, FormEvent } from "react";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BadgeCheck,
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
  X,
  Zap,
} from "lucide-react";

type Platform = "instagram" | "tiktok" | "youtube-shorts";
type Theme = "instagram" | "tiktok" | "youtube";

type Lesson = {
  slug: Platform;
  theme: Theme;
  title: string;
  platformLabel: string;
  subtitle: string;
  description: string;
  price: number;
  oldPrice: number;
  stat: string;
  statLabel: string;
  image: string;
  icon: LucideIcon;
  bullets: string[];
};

const lessons: Lesson[] = [
  {
    slug: "instagram",
    theme: "instagram",
    title: "Instagram Algorithm",
    platformLabel: "Instagram",
    subtitle: "Как Reels получают охваты",
    description:
      "Разбор того, как Instagram оценивает Reels, какие сигналы влияют на рекомендации и как упаковать профиль под рост.",
    price: 249,
    oldPrice: 990,
    stat: "+128%",
    statLabel: "к охватам",
    image: "/lesson-images/instagram-growth.png",
    icon: Instagram,
    bullets: [
      "Рост охватов",
      "Контент-стратегия",
      "Сценарии Reels",
      "Аналитика",
      "Упаковка профиля",
      "Воронка заявок",
    ],
  },
  {
    slug: "tiktok",
    theme: "tiktok",
    title: "TikTok Algorithm",
    platformLabel: "TikTok",
    subtitle: "Как попасть в рекомендации",
    description:
      "Разбор удержания, первых секунд, досмотров, серийности роликов и механики попадания в рекомендации.",
    price: 199,
    oldPrice: 790,
    stat: "+215%",
    statLabel: "к вовлечению",
    image: "/lesson-images/tiktok-growth.png",
    icon: Music2,
    bullets: [
      "Первые 1–3 секунды",
      "Досмотры",
      "Повторные просмотры",
      "Серийность",
      "Тест гипотез",
      "Вирусные форматы",
    ],
  },
  {
    slug: "youtube-shorts",
    theme: "youtube",
    title: "YouTube Shorts Algorithm",
    platformLabel: "YouTube Shorts",
    subtitle: "Как Shorts получают просмотры",
    description:
      "Разбор CTR, удержания, повторных просмотров, тематики канала и роста через короткие видео.",
    price: 199,
    oldPrice: 790,
    stat: "+184%",
    statLabel: "к просмотрам",
    image: "/lesson-images/youtube-shorts-growth.png",
    icon: PlaySquare,
    bullets: [
      "CTR и свайпы",
      "Удержание",
      "Повторные просмотры",
      "Тематика канала",
      "Структура ролика",
      "Рост канала",
    ],
  },
];

const stats = [
  {
    value: "3",
    label: "платформы",
  },
  {
    value: "199 ₽",
    label: "старт урока",
  },
  {
    value: "0",
    label: "регистраций",
  },
  {
    value: "сразу",
    label: "доступ после покупки",
  },
];

function getLesson(slug: Platform) {
  return lessons.find((lesson) => lesson.slug === slug) ?? lessons[0];
}

function getThemeClass(theme: Theme) {
  return {
    tab: `product-tab product-tab--${theme}`,
    card: `product-card product-card--${theme}`,
    badge: `platform-badge platform-badge--${theme}`,
  };
}

export default function HomePage() {
  const [activeSlug, setActiveSlug] = useState<Platform>("instagram");
  const [checkoutLesson, setCheckoutLesson] = useState<Lesson | null>(null);
  const [email, setEmail] = useState("");
  const [isBuying, setIsBuying] = useState(false);
  const [error, setError] = useState("");

  const activeLesson = useMemo(() => getLesson(activeSlug), [activeSlug]);
  const ActiveIcon = activeLesson.icon;

  function openCheckout(lesson: Lesson) {
    setCheckoutLesson(lesson);
    setEmail("");
    setError("");
    setIsBuying(false);
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
    <main className="site-page">
      <div className="site-noise" />

      <section id="hero" className="art-hero">
        <div className="art-hero-bg" />

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
            onClick={() => openCheckout(activeLesson)}
          >
            Купить урок
          </button>
        </header>

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

      <section id="lessons" className="lessons-block">
        <div className="container">
          <div className="tabs-row">
            {lessons.map((lesson) => {
              const Icon = lesson.icon;
              const ui = getThemeClass(lesson.theme);

              return (
                <button
                  key={lesson.slug}
                  type="button"
                  className={`${ui.tab} ${
                    activeLesson.slug === lesson.slug ? "is-active" : ""
                  }`}
                  onClick={() => setActiveSlug(lesson.slug)}
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

              <div className="product-card-content product-card-content--single">
                <div className="product-copy">
                  <div className={getThemeClass(activeLesson.theme).badge}>
                    <ActiveIcon size={18} />
                    {activeLesson.platformLabel}
                  </div>

                  <h2 className="product-title">{activeLesson.subtitle}</h2>

                  <p className="product-description">
                    {activeLesson.description}
                  </p>

                  <div className="product-stats-row">
                    <div className="product-stat-box">
                      <div className="product-stat-value">
                        {activeLesson.stat}
                      </div>
                      <div className="product-stat-label">
                        {activeLesson.statLabel}
                      </div>
                    </div>

                    <div className="product-price-box">
                      <div className="product-price-current">
                        {activeLesson.price} ₽
                      </div>
                      <div className="product-price-old">
                        {activeLesson.oldPrice} ₽
                      </div>
                    </div>
                  </div>

                  <div className="product-bullets">
                    {activeLesson.bullets.map((bullet) => (
                      <div key={bullet} className="product-bullet">
                        <span>
                          <Check size={14} />
                        </span>
                        {bullet}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="product-bg-space" aria-hidden="true" />

                <div className="product-bottom-action">
                  <button
                    type="button"
                    className="gold-btn gold-btn--large"
                    onClick={() => openCheckout(activeLesson)}
                  >
                    Купить урок за {activeLesson.price} ₽
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      <section id="growth" className="container growth-showcase-section">
        <div className="growth-showcase-head">
          <div className="section-label">
            <Sparkles size={16} />
            Рост по платформам
          </div>

          <h2 className="section-title">Выбери направление роста</h2>

          <p className="section-text">
            Каждый урок — это отдельный закрытый материал по конкретной
            платформе: охваты, просмотры, вовлечение, удержание и рост через
            алгоритмы.
          </p>
        </div>

        <div className="growth-showcase-grid">
          {lessons.map((lesson) => {
            const Icon = lesson.icon;

            return (
              <button
                key={lesson.slug}
                type="button"
                className={`growth-showcase-card growth-showcase-card--${lesson.theme}`}
                style={
                  {
                    "--growth-bg": `url("${lesson.image}")`,
                  } as CSSProperties
                }
                onClick={() => openCheckout(lesson)}
              >
                <div className="growth-showcase-overlay" />

                <div className="growth-showcase-content">
                  <div className="growth-showcase-badge">
                    <Icon size={18} />
                    {lesson.platformLabel}
                  </div>

                  <h3>{lesson.subtitle}</h3>

                  <p>{lesson.description}</p>

                  <div className="growth-showcase-bottom">
                    <div>
                      <div className="growth-showcase-price">
                        {lesson.price} ₽
                      </div>
                      <div className="growth-showcase-old">
                        {lesson.oldPrice} ₽
                      </div>
                    </div>

                    <div className="growth-showcase-action">
                      Купить урок
                      <ArrowRight size={18} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section id="inside" className="container content-section">
        <div className="content-panel">
          <div className="section-label">
            <ShieldCheck size={16} />
            Что получает покупатель
          </div>

          <h2 className="section-title">Закрытая статья без воды</h2>

          <p className="section-text">
            После покупки открывается уникальная ссылка на материал. Пользователь
            не регистрируется, не создаёт личный кабинет и не помнит пароль.
            Только email и доступ к закрытой статье.
          </p>

          <div className="info-grid">
            <div className="info-card">
              <div className="info-number">01</div>
              <h3>Как платформа тестирует контент</h3>
              <p>
                Почему один ролик получает показы, а другой умирает на старте.
              </p>
            </div>

            <div className="info-card">
              <div className="info-number">02</div>
              <h3>Какие метрики важны</h3>
              <p>
                Удержание, досмотры, реакции, CTR, свайпы, сохранения и повторы.
              </p>
            </div>

            <div className="info-card">
              <div className="info-number">03</div>
              <h3>Как делать контент системно</h3>
              <p>
                Форматы, серии, темы, упаковка и ошибки, которые режут охваты.
              </p>
            </div>
          </div>
        </div>
      </section>

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
                className={`package-card package-card--${lesson.theme}`}
                onClick={() => openCheckout(lesson)}
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

      <section className="container content-section">
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

      <section id="faq" className="container content-section last-section">
        <div className="content-panel">
          <div className="section-label">
            <BadgeCheck size={16} />
            FAQ
          </div>

          <h2 className="section-title">Частые вопросы</h2>

          <div className="info-grid">
            <div className="info-card">
              <h3>Нужна регистрация?</h3>
              <p>
                Нет. Покупатель выбирает урок, вводит email и получает ссылку.
              </p>
            </div>

            <div className="info-card">
              <h3>Это про накрутку?</h3>
              <p>
                Нет. Это обучающие материалы про алгоритмы, контент и аналитику.
              </p>
            </div>

            <div className="info-card">
              <h3>Что открывается после оплаты?</h3>
              <p>
                Закрытая статья по уникальной ссылке вида /access/secret-token.
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
                setIsBuying(false);
              }
            }}
          >
            <motion.div
              className="modal-card"
              initial={{ opacity: 0, scale: 0.96, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 18 }}
              transition={{ duration: 0.2 }}
            >
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setCheckoutLesson(null);
                  setIsBuying(false);
                }}
              >
                <X size={18} />
              </button>

              <div className={`modal-icon modal-icon--${checkoutLesson.theme}`}>
                <checkoutLesson.icon size={34} />
              </div>

              <h3 className="modal-title">{checkoutLesson.title}</h3>

              <p className="modal-text">
                Введи email. Сейчас в MVP доступ откроется сразу. После
                подключения платёжки здесь будет оплата и автоматическая выдача
                ссылки.
              </p>

              <div className="modal-price">
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
                <label className="modal-label">Email для доступа</label>

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

                <button
                  disabled={isBuying}
                  type="submit"
                  className="gold-btn modal-submit"
                >
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
