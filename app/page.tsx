"use client";

import { FormEvent, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Check,
  Crown,
  LockKeyhole,
  Mail,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  X,
  Zap,
} from "lucide-react";

type Platform = "instagram" | "tiktok" | "youtube-shorts";

type Lesson = {
  slug: Platform;
  title: string;
  platformName: string;
  icon: string;
  price: number;
  oldPrice: number;
  stat: string;
  statLabel: string;
  headline: string;
  description: string;
  bullets: string[];
  className: string;
  glow: string;
  sideGlow: string;
};

const lessons: Lesson[] = [
  {
    slug: "instagram",
    title: "Instagram Algorithm",
    platformName: "Instagram",
    icon: "◎",
    price: 249,
    oldPrice: 990,
    stat: "+128%",
    statLabel: "к охватам",
    headline: "Instagram: как Reels получают охваты и заявки",
    description:
      "Закрытый урок о том, как Instagram оценивает Reels, какие сигналы влияют на рекомендации и как упаковать профиль под рост.",
    bullets: [
      "Как Reels попадают в рекомендации",
      "Первые секунды и удержание",
      "Сохранения, реакции и досмотры",
      "Упаковка профиля под доверие",
      "Контент-связки и серии",
      "Ошибки, которые режут охваты",
    ],
    className: "instagram",
    glow: "rgba(255, 90, 196, 0.42)",
    sideGlow: "rgba(255, 90, 196, 0.30)",
  },
  {
    slug: "tiktok",
    title: "TikTok Algorithm",
    platformName: "TikTok",
    icon: "♪",
    price: 199,
    oldPrice: 790,
    stat: "+215%",
    statLabel: "к вовлечению",
    headline: "TikTok: как ролики попадают в рекомендации",
    description:
      "Разбор удержания, первых секунд, досмотров, серийности роликов и механики быстрого теста контента.",
    bullets: [
      "Как TikTok тестирует ролики",
      "Первые 1–3 секунды",
      "Досмотры и повторные просмотры",
      "Почему важна серийность",
      "Как находить рабочие форматы",
      "Как быстро тестировать гипотезы",
    ],
    className: "tiktok",
    glow: "rgba(37, 244, 255, 0.32)",
    sideGlow: "rgba(37, 244, 255, 0.24)",
  },
  {
    slug: "youtube-shorts",
    title: "YouTube Shorts Algorithm",
    platformName: "YouTube Shorts",
    icon: "▶",
    price: 199,
    oldPrice: 790,
    stat: "+184%",
    statLabel: "к просмотрам",
    headline: "YouTube Shorts: как короткие видео получают показы",
    description:
      "Урок про CTR, удержание, свайпы, повторные просмотры, тематику канала и рост через короткие видео.",
    bullets: [
      "Как Shorts получает показы",
      "CTR, удержание и свайпы",
      "Почему важна тема канала",
      "Как делать ролики плотнее",
      "Повторные просмотры",
      "Ошибки, которые режут показы",
    ],
    className: "youtube",
    glow: "rgba(255, 78, 48, 0.34)",
    sideGlow: "rgba(255, 78, 48, 0.28)",
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

function getLessonBySlug(slug: Platform) {
  return lessons.find((lesson) => lesson.slug === slug) ?? lessons[0];
}

export default function HomePage() {
  const [activeSlug, setActiveSlug] = useState<Platform>("instagram");
  const [checkoutLesson, setCheckoutLesson] = useState<Lesson | null>(null);
  const [email, setEmail] = useState("");
  const [isBuying, setIsBuying] = useState(false);
  const [error, setError] = useState("");

  const activeLesson = useMemo(() => getLessonBySlug(activeSlug), [activeSlug]);

  const sideLessons = useMemo(
    () => lessons.filter((lesson) => lesson.slug !== activeLesson.slug),
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
    <main className="destroy-page">
      <div className="bg-aurora" />

      <div className="outer-wrap">
        <div className="browser">
          <div className="browser-top">
            <div className="browser-dots">
              <span className="browser-dot red" />
              <span className="browser-dot yellow" />
              <span className="browser-dot green" />
            </div>

            <div className="browser-arrows">
              <span>‹</span>
              <span>›</span>
            </div>

            <div className="browser-address">
              <LockKeyhole size={15} />
              <span>destroy-algoritm.ru</span>
            </div>

            <div className="browser-close">×</div>
          </div>

          <div className="site">
            <header className="container header">
              <a href="#" className="logo">
                <div className="logo-mark">
                  <Crown size={30} />
                </div>

                <div>
                  <div className="logo-title">DESTROY</div>
                  <div className="logo-sub">ALGORITM</div>
                </div>
              </a>

              <nav className="nav">
                <a href="#home">Главная</a>
                <a href="#lessons">Уроки</a>
                <a href="#inside">Что внутри</a>
                <a href="#packages">Пакеты</a>
                <a href="#faq">FAQ</a>
              </nav>

              <button
                type="button"
                className="btn gold"
                onClick={() => openCheckout(activeLesson)}
              >
                Купить урок
              </button>
            </header>

            <section id="home" className="container hero">
              <motion.div
                className="hero-left"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7 }}
              >
                <div className="kicker">
                  <Sparkles size={17} />
                  Мини-уроки по алгоритмам соцсетей
                </div>

                <h1 className="hero-title">
                  DESTROY
                  <span className="small">ALGORITM</span>
                </h1>

                <div className="hero-platforms">
                  Instagram • TikTok • YouTube Shorts
                </div>

                <div className="hero-copy">
                  Разбери, как соцсети раздают охваты, и начни делать контент,
                  который система реально продвигает.
                </div>

                <div className="badges">
                  <div className="badge">
                    <LockKeyhole size={20} />
                    Без регистрации
                  </div>

                  <div className="badge">
                    <Zap size={20} />
                    Доступ сразу
                  </div>

                  <div className="badge">
                    <BadgeCheck size={20} />
                    От 199 ₽
                  </div>
                </div>

                <div className="hero-actions">
                  <a href="#lessons" className="btn gold">
                    Выбрать урок
                    <ArrowRight size={18} />
                  </a>

                  <a href="#inside" className="btn dark">
                    Что внутри
                    <Play size={18} />
                  </a>
                </div>
              </motion.div>

              <motion.div
                className="hero-stage"
                initial={{ opacity: 0, scale: 0.95, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.1 }}
              >
                <div className="halo" />

                <div className="platforms-3d">
                  {lessons.map((lesson, index) => (
                    <button
                      key={lesson.slug}
                      type="button"
                      className={`platform-wrap ${
                        index === 0 ? "left" : index === 1 ? "center" : "right"
                      }`}
                      onClick={() => setActiveSlug(lesson.slug)}
                    >
                      <div className="wings" />

                      <div className={`platform-3d ${lesson.className}`}>
                        <div className="platform-icon">
                          <span className="platform-symbol">{lesson.icon}</span>
                        </div>

                        <div className="platform-title">
                          {lesson.platformName}
                        </div>

                        <div className="metric-box">
                          <div className="metric-row">
                            <div>
                              <div className="metric-value">{lesson.stat}</div>
                              <div className="metric-label">
                                {lesson.statLabel}
                              </div>
                            </div>

                            <BarChart3 size={42} color="#ffe08a" />
                          </div>
                        </div>
                      </div>

                      <div className="pedestal" />
                    </button>
                  ))}
                </div>
              </motion.div>
            </section>

            <section id="lessons" className="container">
              <div className="tabs">
                {lessons.map((lesson) => (
                  <button
                    key={lesson.slug}
                    type="button"
                    className={`tab ${lesson.className} ${
                      activeLesson.slug === lesson.slug ? "active" : ""
                    }`}
                    onClick={() => setActiveSlug(lesson.slug)}
                  >
                    <div className="tab-content">
                      <div className="tab-icon">{lesson.icon}</div>

                      <div>
                        <div className="tab-title">{lesson.platformName}</div>
                        <div className="tab-price">
                          {lesson.price} ₽ вместо {lesson.oldPrice} ₽
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="lesson-area">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeLesson.slug}
                    className="lesson-panel"
                    style={
                      {
                        "--active-glow": activeLesson.glow,
                      } as React.CSSProperties
                    }
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -18 }}
                    transition={{ duration: 0.24 }}
                  >
                    <div className="lesson-inner">
                      <div>
                        <div className="lesson-kicker">
                          <Sparkles size={16} />
                          Закрытый урок
                        </div>

                        <h2 className="lesson-title">
                          {activeLesson.headline}
                        </h2>

                        <p className="lesson-desc">
                          {activeLesson.description}
                        </p>

                        <div className="bullets">
                          {activeLesson.bullets.map((bullet) => (
                            <div key={bullet} className="bullet">
                              <span className="check">
                                <Check size={15} />
                              </span>
                              <span>{bullet}</span>
                            </div>
                          ))}
                        </div>

                        <div className="lesson-actions">
                          <button
                            type="button"
                            className="btn gold"
                            onClick={() => openCheckout(activeLesson)}
                          >
                            Купить за {activeLesson.price} ₽
                            <ArrowRight size={18} />
                          </button>

                          <a href="#inside" className="btn dark">
                            Что внутри
                            <Play size={18} />
                          </a>
                        </div>
                      </div>

                      <div className="phone-area">
                        <div className="phone-glow" />

                        <div className="phone">
                          <div className="phone-screen">
                            <div className="phone-top">
                              <span>{activeLesson.platformName}</span>
                              <span>12.6K</span>
                            </div>

                            <div className="phone-card">
                              <div className="phone-card-label">
                                Рост метрик
                              </div>
                              <div className="phone-card-value">
                                {activeLesson.stat}
                              </div>
                            </div>

                            <div className="phone-bars">
                              {[58, 94, 74, 126, 166].map((height, index) => (
                                <div
                                  key={index}
                                  className="phone-bar"
                                  style={{ height }}
                                />
                              ))}
                            </div>

                            <div className="phone-arrow" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>

                <div className="side-stack">
                  {sideLessons.map((lesson) => (
                    <button
                      key={lesson.slug}
                      type="button"
                      className="side-card"
                      style={
                        {
                          "--side-glow": lesson.sideGlow,
                        } as React.CSSProperties
                      }
                      onClick={() => setActiveSlug(lesson.slug)}
                    >
                      <h3 className="side-title">{lesson.platformName}</h3>

                      <p className="side-desc">{lesson.description}</p>

                      <div
                        className={`side-visual ${
                          lesson.slug === "tiktok" ? "tiktok" : "youtube"
                        }`}
                      >
                        <div className="side-phone">{lesson.icon}</div>

                        <div className="side-bars">
                          {[42, 66, 54, 88, 120].map((height, index) => (
                            <div
                              key={index}
                              className="side-bar"
                              style={{
                                height,
                                background:
                                  lesson.slug === "tiktok"
                                    ? "linear-gradient(180deg,#21f4ff,#ff4b8d)"
                                    : "linear-gradient(180deg,#ffbd4d,#ff4530)",
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section id="inside" className="container section">
              <div className="section-panel">
                <div className="section-head">
                  <div className="section-kicker">
                    <ShieldCheck size={16} />
                    Что получает покупатель
                  </div>

                  <h2 className="section-title">
                    Закрытая статья без воды
                  </h2>

                  <p className="section-text">
                    Пользователь покупает урок, вводит email и сразу получает
                    доступ к закрытой странице по уникальной ссылке. Никакой
                    регистрации, личного кабинета и лишних шагов.
                  </p>
                </div>

                <div className="info-grid">
                  <div className="info-card">
                    <div className="info-num">01</div>
                    <h3 className="info-title">
                      Как платформа тестирует контент
                    </h3>
                    <p className="info-text">
                      Понятно объясняем, почему один ролик получает показы, а
                      другой умирает на старте.
                    </p>
                  </div>

                  <div className="info-card">
                    <div className="info-num">02</div>
                    <h3 className="info-title">
                      Какие метрики реально важны
                    </h3>
                    <p className="info-text">
                      Удержание, досмотры, реакции, свайпы, CTR, сохранения и
                      повторные просмотры.
                    </p>
                  </div>

                  <div className="info-card">
                    <div className="info-num">03</div>
                    <h3 className="info-title">
                      Как делать контент системно
                    </h3>
                    <p className="info-text">
                      Не угадывать, а собирать форматы, серии и темы, которые
                      можно повторять.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section id="packages" className="container section">
              <div className="section-panel">
                <div className="section-head">
                  <div className="section-kicker">
                    <Star size={16} />
                    Пакеты уроков
                  </div>

                  <h2 className="section-title">Выбери свой разбор</h2>

                  <p className="section-text">
                    На старте продаём отдельные мини-уроки. Позже можно добавить
                    комплект из всех трёх платформ.
                  </p>
                </div>

                <div className="packages-grid">
                  <div className="package-card">
                    <div className="package-title">Instagram</div>
                    <div className="package-price">249 ₽</div>
                    <div className="package-old">990 ₽</div>
                    <p className="package-desc">
                      Reels, охваты, упаковка профиля, удержание и заявки.
                    </p>
                  </div>

                  <div className="package-card hot">
                    <div className="package-badge">Хит</div>
                    <div className="package-title">TikTok</div>
                    <div className="package-price">199 ₽</div>
                    <div className="package-old">790 ₽</div>
                    <p className="package-desc">
                      Рекомендации, досмотры, первые секунды и вирусные форматы.
                    </p>
                  </div>

                  <div className="package-card">
                    <div className="package-title">YouTube Shorts</div>
                    <div className="package-price">199 ₽</div>
                    <div className="package-old">790 ₽</div>
                    <p className="package-desc">
                      CTR, удержание, свайпы, повторные просмотры и рост канала.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="container section">
              <div className="section-panel">
                <div className="stats-grid">
                  {stats.map((stat) => (
                    <div key={stat.label} className="stat-card">
                      <div className="stat-value">{stat.value}</div>
                      <div className="stat-label">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section id="faq" className="container section">
              <div className="section-panel">
                <div className="section-head">
                  <div className="section-kicker">
                    <BadgeCheck size={16} />
                    FAQ
                  </div>

                  <h2 className="section-title">Частые вопросы</h2>
                </div>

                <div className="info-grid">
                  <div className="info-card">
                    <h3 className="info-title">Нужна регистрация?</h3>
                    <p className="info-text">
                      Нет. Покупатель выбирает урок, вводит email и получает
                      уникальную ссылку доступа.
                    </p>
                  </div>

                  <div className="info-card">
                    <h3 className="info-title">Это накрутка?</h3>
                    <p className="info-text">
                      Нет. Это обучающие материалы про механику рекомендаций,
                      контент, удержание и аналитику.
                    </p>
                  </div>

                  <div className="info-card">
                    <h3 className="info-title">Где будет статья?</h3>
                    <p className="info-text">
                      После покупки открывается закрытая страница вида
                      /access/уникальный-токен.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <footer className="container footer">
              DESTROY ALGORITM © 2026 · Уроки по алгоритмам соцсетей
            </footer>
          </div>
        </div>
      </div>

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
              className="modal"
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              <button
                type="button"
                className="modal-close"
                onClick={() => setCheckoutLesson(null)}
              >
                <X size={20} />
              </button>

              <div className="modal-icon">{checkoutLesson.icon}</div>

              <h3 className="modal-title">{checkoutLesson.title}</h3>

              <p className="modal-text">
                Введи email. Сейчас в MVP доступ откроется сразу. После
                подключения платежки здесь будет переход к оплате и отправка
                ссылки на почту.
              </p>

              <div className="price-box">
                <div className="price-row">
                  <div>
                    <div className="price-label">Стоимость урока</div>
                    <div className="price-value">{checkoutLesson.price} ₽</div>
                  </div>

                  <div className="old-price">
                    вместо <span>{checkoutLesson.oldPrice} ₽</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleBuy}>
                <label className="form-label">Email для доступа</label>

                <div className="input-wrap">
                  <div className="input-icon">
                    <Mail size={20} />
                  </div>

                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="example@mail.com"
                    className="input"
                  />
                </div>

                {error ? <div className="error">{error}</div> : null}

                <button disabled={isBuying} type="submit" className="btn gold">
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
