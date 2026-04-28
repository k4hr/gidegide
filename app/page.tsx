"use client";

import { FormEvent, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Check,
  Crown,
  Flame,
  LockKeyhole,
  Mail,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

type Platform = "instagram" | "tiktok" | "youtube-shorts";

type Lesson = {
  slug: Platform;
  title: string;
  platformLabel: string;
  shortLabel: string;
  price: number;
  oldPrice: number;
  accent: string;
  tabClass: string;
  cardClass: string;
  icon: string;
  stat: string;
  statLabel: string;
  description: string;
  bullets: string[];
};

const lessons: Lesson[] = [
  {
    slug: "instagram",
    title: "Instagram Algorithm",
    platformLabel: "Instagram",
    shortLabel: "Instagram",
    price: 249,
    oldPrice: 990,
    accent: "#ff4fc3",
    tabClass:
      "from-fuchsia-500 via-pink-500 to-orange-400 text-white shadow-pink-500/30",
    cardClass:
      "from-fuchsia-500/90 via-pink-500/90 to-orange-400/90 border-pink-200/50",
    icon: "◎",
    stat: "+128%",
    statLabel: "к охватам",
    description:
      "Разбор того, как Reels получают рекомендации, какие сигналы влияют на показы и как упаковать профиль под рост.",
    bullets: [
      "Как Reels попадают в рекомендации",
      "Удержание и первые секунды",
      "Упаковка профиля под доверие",
      "Контент-связки и серии",
      "Ошибки, которые режут охваты",
    ],
  },
  {
    slug: "tiktok",
    title: "TikTok Algorithm",
    platformLabel: "TikTok",
    shortLabel: "TikTok",
    price: 199,
    oldPrice: 790,
    accent: "#19f7ff",
    tabClass:
      "from-zinc-950 via-black to-zinc-900 text-white shadow-cyan-500/20",
    cardClass:
      "from-zinc-950 via-black to-zinc-900 border-cyan-200/30",
    icon: "♪",
    stat: "+215%",
    statLabel: "к вовлечению",
    description:
      "Разбор удержания, досмотров, первых секунд, серийности роликов и механики попадания в рекомендации.",
    bullets: [
      "Как TikTok тестирует ролики",
      "Первые 1–3 секунды",
      "Досмотры и повторные просмотры",
      "Как делать серийный контент",
      "Как быстро тестировать гипотезы",
    ],
  },
  {
    slug: "youtube-shorts",
    title: "YouTube Shorts Algorithm",
    platformLabel: "YouTube Shorts",
    shortLabel: "Shorts",
    price: 199,
    oldPrice: 790,
    accent: "#ff2b2b",
    tabClass:
      "from-red-700 via-red-600 to-orange-500 text-white shadow-red-500/25",
    cardClass:
      "from-red-900 via-red-700 to-orange-600 border-red-200/40",
    icon: "▶",
    stat: "+184%",
    statLabel: "к просмотрам",
    description:
      "Разбор CTR, удержания, повторных просмотров, тематики канала и роста через короткие видео.",
    bullets: [
      "Как Shorts получает показы",
      "CTR, удержание и свайпы",
      "Почему важна тема канала",
      "Как делать ролики плотнее",
      "Как превращать Shorts в рост канала",
    ],
  },
];

const stats = [
  {
    value: "3",
    label: "платформы",
    icon: Sparkles,
  },
  {
    value: "199₽",
    label: "старт урока",
    icon: Flame,
  },
  {
    value: "0",
    label: "регистраций",
    icon: LockKeyhole,
  },
  {
    value: "сразу",
    label: "доступ после покупки",
    icon: Zap,
  },
];

export default function HomePage() {
  const [activeSlug, setActiveSlug] = useState<Platform>("instagram");
  const [checkoutLesson, setCheckoutLesson] = useState<Lesson | null>(null);
  const [email, setEmail] = useState("");
  const [isBuying, setIsBuying] = useState(false);
  const [error, setError] = useState("");

  const activeLesson = useMemo(
    () => lessons.find((lesson) => lesson.slug === activeSlug) ?? lessons[0],
    [activeSlug],
  );

  async function handleBuy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!checkoutLesson) {
      return;
    }

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
    <main className="min-h-screen overflow-hidden bg-black text-[#fff7df]">
      <div className="browser-bar sticky top-0 z-50 hidden h-11 items-center gap-3 px-4 md:flex">
        <div className="flex gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="h-3 w-3 rounded-full bg-yellow-400" />
          <span className="h-3 w-3 rounded-full bg-green-500" />
        </div>

        <div className="ml-3 flex items-center gap-2 text-zinc-400">
          <span>‹</span>
          <span>›</span>
        </div>

        <div className="mx-auto flex h-7 w-full max-w-[760px] items-center rounded-md bg-black/35 px-4 text-sm text-zinc-300">
          destroy-algoritm.ru
        </div>

        <X className="h-4 w-4 text-zinc-400" />
      </div>

      <section className="hero-bg relative min-h-screen overflow-hidden">
        <div className="noise-bg" />
        <div className="cloud-layer absolute inset-x-0 bottom-0 h-[46%]" />

        <div className="absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-yellow-300/20 blur-[80px]" />
        <div className="absolute right-[8%] top-[12%] h-[320px] w-[320px] rounded-full bg-amber-400/20 blur-[70px]" />
        <div className="absolute left-[4%] top-[20%] hidden h-[420px] w-[180px] rounded-full border border-yellow-300/15 bg-gradient-to-b from-yellow-300/10 to-transparent blur-[1px] lg:block" />

        <header className="relative z-20 mx-auto flex w-full max-w-[1500px] items-center justify-between px-5 py-5 md:px-8 lg:px-10">
          <a href="#" className="flex items-center gap-3">
            <div className="relative flex h-13 w-13 items-center justify-center rounded-2xl border border-yellow-200/50 bg-black/55 shadow-[0_0_34px_rgba(255,205,90,0.26)]">
              <Crown className="h-7 w-7 text-yellow-300" />
              <div className="absolute -inset-1 rounded-2xl border border-yellow-300/20" />
            </div>

            <div>
              <div className="text-xl font-black tracking-wide text-yellow-200 md:text-2xl">
                DESTROY
              </div>
              <div className="-mt-1 text-xs font-bold uppercase tracking-[0.25em] text-yellow-400/80">
                ALGORITM
              </div>
            </div>
          </a>

          <nav className="hidden items-center gap-8 text-sm font-bold uppercase tracking-wide text-yellow-100/80 lg:flex">
            <a className="transition hover:text-yellow-300" href="#lessons">
              Уроки
            </a>
            <a className="transition hover:text-yellow-300" href="#inside">
              Что внутри
            </a>
            <a className="transition hover:text-yellow-300" href="#how">
              Как купить
            </a>
            <a className="transition hover:text-yellow-300" href="#faq">
              FAQ
            </a>
          </nav>

          <a
            href="#lessons"
            className="gold-button rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-wide transition md:px-6"
          >
            Купить урок
          </a>
        </header>

        <div className="relative z-10 mx-auto grid w-full max-w-[1500px] items-center gap-10 px-5 pb-16 pt-5 md:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-10 lg:pb-20 lg:pt-8">
          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-yellow-200/30 bg-black/40 px-4 py-2 text-sm font-bold text-yellow-100 shadow-[0_0_35px_rgba(255,209,91,0.13)] backdrop-blur-xl">
              <Sparkles className="h-4 w-4 text-yellow-300" />
              Мини-уроки по алгоритмам соцсетей
            </div>

            <h1 className="gold-text max-w-[760px] text-[3.1rem] font-black uppercase leading-[0.88] tracking-[-0.08em] sm:text-[4.5rem] md:text-[6.4rem] lg:text-[6.8rem] xl:text-[7.6rem]">
              DESTROY ALGORITM
            </h1>

            <div className="mt-6 text-2xl font-black text-white md:text-4xl">
              Instagram • TikTok • YouTube Shorts
            </div>

            <p className="mt-5 max-w-[650px] text-xl font-bold leading-snug text-yellow-50/86 md:text-2xl">
              Разбери, как соцсети раздают охваты. Купи короткий урок и получи
              доступ сразу после оплаты.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {[
                {
                  label: "Без регистрации",
                  icon: LockKeyhole,
                },
                {
                  label: "Доступ сразу",
                  icon: Zap,
                },
                {
                  label: "От 199 ₽",
                  icon: BadgeCheck,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="gold-panel flex items-center gap-3 rounded-2xl px-4 py-3"
                >
                  <item.icon className="h-5 w-5 text-yellow-300" />
                  <span className="font-black uppercase tracking-wide text-yellow-100">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <a
                href="#lessons"
                className="gold-button inline-flex items-center justify-center gap-3 rounded-2xl px-7 py-4 text-base font-black uppercase tracking-wide transition"
              >
                Выбрать урок
                <ArrowRight className="h-5 w-5" />
              </a>

              <a
                href="#inside"
                className="dark-button inline-flex items-center justify-center gap-3 rounded-2xl px-7 py-4 text-base font-black uppercase tracking-wide transition hover:border-yellow-200/70"
              >
                Что внутри
                <Play className="h-5 w-5" />
              </a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="relative"
          >
            <div className="absolute left-1/2 top-0 h-36 w-72 -translate-x-1/2 rounded-full border border-yellow-200/50 bg-yellow-300/10 blur-[1px]" />
            <div className="absolute left-1/2 top-8 h-24 w-96 -translate-x-1/2 rounded-full bg-yellow-300/25 blur-[40px]" />

            <div className="grid gap-5 md:grid-cols-3">
              {lessons.map((lesson, index) => (
                <motion.button
                  key={lesson.slug}
                  type="button"
                  onClick={() => setActiveSlug(lesson.slug)}
                  whileHover={{ y: -8, rotate: index === 0 ? -2 : index === 2 ? 2 : 0 }}
                  className={`platform-card relative min-h-[300px] overflow-hidden rounded-[2rem] border bg-gradient-to-br p-5 text-left shadow-2xl transition ${
                    lesson.cardClass
                  } ${
                    activeSlug === lesson.slug
                      ? "scale-[1.02] shadow-yellow-400/30"
                      : "opacity-85 hover:opacity-100"
                  }`}
                >
                  <div className="wing-left" />
                  <div className="wing-right" />

                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.38),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.16),transparent)]" />
                  <div className="absolute -bottom-14 left-1/2 h-36 w-36 -translate-x-1/2 rounded-full bg-yellow-300/30 blur-3xl" />

                  <div className="relative z-10 flex h-full min-h-[260px] flex-col justify-between">
                    <div>
                      <div className="mb-6 flex justify-center">
                        <div className="flex h-24 w-24 items-center justify-center rounded-[1.8rem] border border-white/35 bg-white/12 text-6xl font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_20px_60px_rgba(0,0,0,0.34)] backdrop-blur-xl">
                          {lesson.icon}
                        </div>
                      </div>

                      <div className="text-center text-2xl font-black text-white">
                        {lesson.platformLabel}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-yellow-200/40 bg-black/40 p-4">
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-2xl font-black text-yellow-200">
                            {lesson.stat}
                          </div>
                          <div className="text-xs font-bold text-white/72">
                            {lesson.statLabel}
                          </div>
                        </div>
                        <BarChart3 className="h-9 w-9 text-yellow-300" />
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section
        id="lessons"
        className="relative overflow-hidden bg-[#050505] px-5 py-16 md:px-8 lg:px-10"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-yellow-300/50 to-transparent" />
        <div className="absolute left-1/2 top-14 h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-yellow-400/10 blur-[100px]" />

        <div className="relative mx-auto max-w-[1500px]">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-yellow-200/25 bg-yellow-300/5 px-4 py-2 text-sm font-bold text-yellow-200">
                <Star className="h-4 w-4" />
                Выбери платформу
              </div>

              <h2 className="text-4xl font-black uppercase tracking-[-0.06em] text-white md:text-6xl">
                Уроки по алгоритмам
              </h2>

              <p className="mt-4 max-w-[720px] text-lg leading-relaxed text-zinc-300">
                Никаких кабинетов и лишних шагов. Выбираешь урок, вводишь email,
                получаешь доступ к закрытой статье.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {stats.map((item) => (
                <div key={item.label} className="gold-panel rounded-2xl p-4">
                  <item.icon className="mb-3 h-5 w-5 text-yellow-300" />
                  <div className="text-2xl font-black text-yellow-100">
                    {item.value}
                  </div>
                  <div className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-3">
            {lessons.map((lesson) => (
              <button
                key={lesson.slug}
                type="button"
                onClick={() => setActiveSlug(lesson.slug)}
                className={`rounded-3xl bg-gradient-to-br px-6 py-5 text-left shadow-2xl transition ${
                  lesson.tabClass
                } ${
                  activeSlug === lesson.slug
                    ? "ring-2 ring-yellow-200/70"
                    : "opacity-72 hover:opacity-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/14 text-2xl font-black">
                    {lesson.icon}
                  </span>
                  <div>
                    <div className="text-xl font-black">
                      {lesson.platformLabel}
                    </div>
                    <div className="text-sm font-bold text-white/72">
                      {lesson.price} ₽ вместо {lesson.oldPrice} ₽
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeLesson.slug}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.25 }}
                className="gold-panel relative overflow-hidden rounded-[2rem] p-6 md:p-8"
              >
                <div
                  className="absolute -right-24 -top-24 h-72 w-72 rounded-full blur-[80px]"
                  style={{ backgroundColor: `${activeLesson.accent}33` }}
                />

                <div className="relative grid gap-8 lg:grid-cols-[1fr_360px]">
                  <div>
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-yellow-200/25 bg-black/35 px-4 py-2 text-sm font-bold text-yellow-200">
                      <Sparkles className="h-4 w-4" />
                      Закрытый урок
                    </div>

                    <h3 className="max-w-[760px] text-4xl font-black tracking-[-0.05em] text-white md:text-6xl">
                      {activeLesson.title}
                    </h3>

                    <p className="mt-5 max-w-[760px] text-lg leading-relaxed text-zinc-300 md:text-xl">
                      {activeLesson.description}
                    </p>

                    <div className="mt-7 grid gap-3 md:grid-cols-2">
                      {activeLesson.bullets.map((bullet) => (
                        <div
                          key={bullet}
                          className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/25 p-4"
                        >
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-300 text-black">
                            <Check className="h-4 w-4" />
                          </span>
                          <span className="font-bold text-zinc-100">
                            {bullet}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={() => {
                          setCheckoutLesson(activeLesson);
                          setEmail("");
                          setError("");
                        }}
                        className="gold-button inline-flex items-center justify-center gap-3 rounded-2xl px-7 py-4 text-base font-black uppercase tracking-wide transition"
                      >
                        Купить за {activeLesson.price} ₽
                        <ArrowRight className="h-5 w-5" />
                      </button>

                      <div className="text-sm font-bold text-zinc-400">
                        Старая цена{" "}
                        <span className="text-zinc-500 line-through">
                          {activeLesson.oldPrice} ₽
                        </span>{" "}
                        · доступ сразу
                      </div>
                    </div>
                  </div>

                  <div className="relative flex min-h-[420px] items-center justify-center">
                    <div className="absolute h-72 w-72 rounded-full bg-yellow-300/15 blur-[55px]" />
                    <div
                      className={`relative w-full max-w-[340px] rounded-[2rem] border bg-gradient-to-br p-5 shadow-2xl ${activeLesson.cardClass}`}
                    >
                      <div className="absolute inset-0 rounded-[2rem] bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.28),transparent_34%)]" />

                      <div className="relative">
                        <div className="mb-6 flex justify-center">
                          <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] border border-white/35 bg-white/14 text-7xl font-black text-white shadow-2xl">
                            {activeLesson.icon}
                          </div>
                        </div>

                        <div className="text-center text-2xl font-black text-white">
                          {activeLesson.platformLabel}
                        </div>

                        <div className="mt-5 rounded-2xl border border-yellow-200/40 bg-black/45 p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-3xl font-black text-yellow-200">
                                {activeLesson.stat}
                              </div>
                              <div className="text-sm font-bold text-white/70">
                                {activeLesson.statLabel}
                              </div>
                            </div>
                            <TrendingUp className="h-10 w-10 text-yellow-300" />
                          </div>
                        </div>

                        <div className="mt-5 grid grid-cols-5 items-end gap-2">
                          {[38, 52, 44, 72, 92].map((height, index) => (
                            <div
                              key={index}
                              className="rounded-t-lg bg-yellow-300/80"
                              style={{ height }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="grid gap-5">
              {lessons
                .filter((lesson) => lesson.slug !== activeLesson.slug)
                .map((lesson) => (
                  <button
                    key={lesson.slug}
                    type="button"
                    onClick={() => setActiveSlug(lesson.slug)}
                    className="gold-panel group relative overflow-hidden rounded-[2rem] p-6 text-left transition hover:-translate-y-1"
                  >
                    <div
                      className="absolute -right-20 -top-20 h-48 w-48 rounded-full blur-[65px]"
                      style={{ backgroundColor: `${lesson.accent}30` }}
                    />

                    <div className="relative flex items-center gap-4">
                      <div
                        className={`flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br text-4xl font-black text-white ${lesson.tabClass}`}
                      >
                        {lesson.icon}
                      </div>

                      <div>
                        <div className="text-2xl font-black text-white">
                          {lesson.platformLabel}
                        </div>
                        <div className="mt-1 text-sm font-bold text-zinc-400">
                          Урок за {lesson.price} ₽
                        </div>
                      </div>
                    </div>

                    <p className="relative mt-5 text-sm leading-relaxed text-zinc-300">
                      {lesson.description}
                    </p>

                    <div className="relative mt-5 inline-flex items-center gap-2 text-sm font-black uppercase tracking-wide text-yellow-200">
                      Смотреть урок
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="inside"
        className="relative overflow-hidden bg-gradient-to-b from-black to-[#0d0903] px-5 py-16 md:px-8 lg:px-10"
      >
        <div className="relative mx-auto max-w-[1500px]">
          <div className="gold-panel rounded-[2rem] p-6 md:p-10">
            <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-yellow-200/25 bg-yellow-300/5 px-4 py-2 text-sm font-bold text-yellow-200">
                  <ShieldCheck className="h-4 w-4" />
                  Что получает покупатель
                </div>

                <h2 className="text-4xl font-black uppercase tracking-[-0.06em] text-white md:text-6xl">
                  Закрытая статья без воды
                </h2>

                <p className="mt-5 text-lg leading-relaxed text-zinc-300">
                  После покупки открывается уникальная ссылка на материал.
                  Пользователю не нужно создавать аккаунт, помнить пароль или
                  заходить в личный кабинет.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {[
                  "Как платформа тестирует контент",
                  "Какие метрики влияют на охваты",
                  "Почему важны первые секунды",
                  "Как строить повторяемые форматы",
                  "Что ломает продвижение",
                  "Как делать контент системно",
                ].map((item) => (
                  <div
                    key={item}
                    className="rounded-3xl border border-white/10 bg-black/35 p-5"
                  >
                    <Check className="mb-4 h-6 w-6 text-yellow-300" />
                    <div className="text-lg font-black text-white">{item}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="how"
        className="relative bg-black px-5 py-16 md:px-8 lg:px-10"
      >
        <div className="relative mx-auto max-w-[1500px]">
          <h2 className="text-center text-4xl font-black uppercase tracking-[-0.06em] text-white md:text-6xl">
            Как это работает
          </h2>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                title: "Выбираешь урок",
                text: "Instagram, TikTok или YouTube Shorts. Цена фиксированная и видна сразу.",
                icon: Crown,
              },
              {
                title: "Вводишь email",
                text: "Email нужен для заказа и ссылки доступа. Регистрация не требуется.",
                icon: Mail,
              },
              {
                title: "Получаешь доступ",
                text: "После покупки открывается закрытая статья по уникальной ссылке.",
                icon: Zap,
              },
            ].map((step, index) => (
              <div key={step.title} className="gold-panel rounded-[2rem] p-7">
                <div className="mb-5 flex items-center justify-between">
                  <step.icon className="h-9 w-9 text-yellow-300" />
                  <div className="text-5xl font-black text-yellow-200/20">
                    0{index + 1}
                  </div>
                </div>
                <div className="text-2xl font-black text-white">
                  {step.title}
                </div>
                <p className="mt-3 leading-relaxed text-zinc-300">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        id="faq"
        className="relative bg-gradient-to-b from-black to-[#070400] px-5 py-16 md:px-8 lg:px-10"
      >
        <div className="mx-auto max-w-[1000px]">
          <h2 className="text-center text-4xl font-black uppercase tracking-[-0.06em] text-white md:text-6xl">
            FAQ
          </h2>

          <div className="mt-10 grid gap-4">
            {[
              {
                q: "Нужна регистрация?",
                a: "Нет. Пользователь просто выбирает урок, вводит email и получает доступ по ссылке.",
              },
              {
                q: "Это про накрутку?",
                a: "Нет. Это обучающие материалы про механику рекомендаций, контент, удержание, упаковку и аналитику.",
              },
              {
                q: "Можно потом подключить реальную оплату?",
                a: "Да. Архитектура уже готова: заказ создаётся в базе, затем после оплаты получает статус PAID.",
              },
            ].map((item) => (
              <div key={item.q} className="gold-panel rounded-3xl p-6">
                <div className="text-xl font-black text-white">{item.q}</div>
                <p className="mt-2 leading-relaxed text-zinc-300">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-yellow-200/10 bg-black px-5 py-8 text-center text-sm font-bold text-zinc-500">
        DESTROY-ALGORITM © 2026 · Разбор алгоритмов соцсетей
      </footer>

      <AnimatePresence>
        {checkoutLesson ? (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/78 p-5 backdrop-blur-xl"
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
              initial={{ opacity: 0, y: 22, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 22, scale: 0.96 }}
              className="gold-panel relative w-full max-w-[560px] overflow-hidden rounded-[2rem] p-6 md:p-8"
            >
              <button
                type="button"
                onClick={() => setCheckoutLesson(null)}
                className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/35 text-zinc-300 transition hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>

              <div
                className="absolute -right-24 -top-24 h-64 w-64 rounded-full blur-[80px]"
                style={{ backgroundColor: `${checkoutLesson.accent}38` }}
              />

              <div className="relative">
                <div
                  className={`mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br text-4xl font-black text-white ${checkoutLesson.tabClass}`}
                >
                  {checkoutLesson.icon}
                </div>

                <h3 className="pr-10 text-3xl font-black tracking-[-0.04em] text-white md:text-5xl">
                  {checkoutLesson.title}
                </h3>

                <p className="mt-4 leading-relaxed text-zinc-300">
                  Введи email. В MVP доступ откроется сразу. Потом сюда
                  подключим оплату и письмо со ссылкой.
                </p>

                <div className="mt-5 rounded-3xl border border-yellow-200/20 bg-black/35 p-5">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold uppercase tracking-wide text-zinc-400">
                        Стоимость урока
                      </div>
                      <div className="mt-1 text-4xl font-black text-yellow-200">
                        {checkoutLesson.price} ₽
                      </div>
                    </div>

                    <div className="text-right text-sm font-bold text-zinc-500">
                      вместо{" "}
                      <span className="line-through">
                        {checkoutLesson.oldPrice} ₽
                      </span>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleBuy} className="mt-6">
                  <label className="mb-2 block text-sm font-black uppercase tracking-wide text-yellow-100">
                    Email для доступа
                  </label>

                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-yellow-300" />
                    <input
                      required
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="example@mail.com"
                      className="h-14 w-full rounded-2xl border border-yellow-200/25 bg-black/45 pl-12 pr-4 text-base font-bold text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-200/70"
                    />
                  </div>

                  {error ? (
                    <div className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
                      {error}
                    </div>
                  ) : null}

                  <button
                    disabled={isBuying}
                    type="submit"
                    className="gold-button mt-5 flex h-14 w-full items-center justify-center gap-3 rounded-2xl text-base font-black uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isBuying ? "Открываем доступ..." : "Получить доступ"}
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </form>

                <p className="mt-4 text-center text-xs font-bold leading-relaxed text-zinc-500">
                  Сейчас стоит покупка-заглушка. После подключения платежки эта
                  кнопка будет вести на оплату.
                </p>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
