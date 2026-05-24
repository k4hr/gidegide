"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FactoryAccount = {
  id: string;
  platform: "YOUTUBE" | "TIKTOK";
  name: string;
};

type FactoryTemplate = {
  id: string;
  name: string;
  isDefault: boolean;
};

type SourceVideo = {
  id: string;
  sourceVideoId: string;
  sourceUrl: string;
  channelId: string | null;
  channelTitle: string | null;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
  viewsPerDay: number;
  likeRate: number;
  commentRate: number;
  sourceScore: number;
  viralChance: number;
  suggestedClips: number;
  suggestedHookMode: string;
  suggestedWindow: string;
  isUsed: boolean;
  usedAt: string | null;
};

type AnalyzeResponse = {
  channel: {
    id: string;
    title: string;
    subscriberCount: number | string;
    videoCount: number | string;
    viewCount: number | string;
    uploadsPlaylistId: string;
  };
  totalSeen: number;
  videos: SourceVideo[];
  recommendations: string[];
  error?: string;
};


type DonorChannel = {
  id: string;
  channelId: string;
  channelTitle: string;
  sourceUrl: string;
  uploadsPlaylistId: string | null;
  subscriberCount: number | string;
  videoCount: number | string;
  viewCount: number | string;
  isActive: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
};

type DonorsResponse = {
  donors: DonorChannel[];
  candidates: SourceVideo[];
  summary?: {
    donors: number;
    active: number;
    candidates: number;
    urgent: number;
    test: number;
    weak: number;
  };
  error?: string;
  message?: string;
};

type DailyPackageResponse = {
  jobs?: Array<{ id: string; scheduledAt: string | null }>;
  candidates?: SourceVideo[];
  message?: string;
  error?: string;
};

type PackageResponse = {
  package?: {
    id: string;
  };
  jobs?: Array<{
    id: string;
    scheduledAt: string | null;
  }>;
  schedule?: Array<{
    index: number;
    scheduledAt: string;
    label: string;
    dayIndex?: number;
  }>;
  bestHour?: number;
  error?: string;
};

type SchedulePace = "SAFE" | "NORMAL" | "AGGRESSIVE";
type ClipLengthMode = "SHORT" | "MEDIUM" | "LONG" | "FULL" | "CUSTOM";


const clipLengthPresets: Record<Exclude<ClipLengthMode, "CUSTOM">, { title: string; min: number; max: number }> = {
  SHORT: { title: "15–25 сек — быстрый тест", min: 15, max: 25 },
  MEDIUM: { title: "25–35 сек — средний", min: 25, max: 35 },
  LONG: { title: "35–45 сек — длиннее", min: 35, max: 45 },
  FULL: { title: "45–60 сек — как раньше", min: 45, max: 60 },
};

function clampClipSeconds(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(10, Math.min(60, Math.round(value)));
}

function getClipLengthRange(input: {
  mode: ClipLengthMode;
  customMin: number;
  customMax: number;
}) {
  if (input.mode !== "CUSTOM") {
    return clipLengthPresets[input.mode];
  }

  const min = clampClipSeconds(input.customMin, 15);
  const max = Math.max(min, clampClipSeconds(input.customMax, 25));

  return { title: `Своя длина: ${min}–${max} сек`, min, max };
}

const schedulePaces: Record<
  SchedulePace,
  {
    title: string;
    description: string;
    intervalMin: number;
    intervalMax: number;
  }
> = {
  SAFE: {
    title: "Безопасно",
    description: "60–90 минут между роликами. Лучше для 15–20 клипов и осторожного залива.",
    intervalMin: 60,
    intervalMax: 90,
  },
  NORMAL: {
    title: "Нормально",
    description: "45–60 минут между роликами. Дефолт для 10 клипов: вечер/ночь New York.",
    intervalMin: 45,
    intervalMax: 60,
  },
  AGGRESSIVE: {
    title: "Агрессивно",
    description: "20–30 минут между роликами. Только для маленьких тестовых пакетов 3–5 клипов.",
    intervalMin: 20,
    intervalMax: 30,
  },
};

function formatNumber(value: number | string | null | undefined) {
  const numberValue = Number(value ?? 0);

  if (!Number.isFinite(numberValue)) {
    return "0";
  }

  return new Intl.NumberFormat("ru-RU").format(Math.round(numberValue));
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("ru-RU", {
    dateStyle: "medium",
  });
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const hourMinutes = minutes % 60;
    return `${hours}ч ${hourMinutes}м`;
  }

  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function scoreClass(score: number) {
  if (score >= 85) return "super-score hot";
  if (score >= 70) return "super-score good";
  if (score >= 50) return "super-score mid";
  return "super-score weak";
}

function getDefaultTemplateId(templates: FactoryTemplate[]) {
  return (
    templates.find((template) => template.isDefault)?.id ??
    templates[0]?.id ??
    ""
  );
}

function getRecommendedPace(clipsCount: number): SchedulePace {
  if (clipsCount <= 5) return "AGGRESSIVE";
  if (clipsCount >= 15) return "SAFE";

  return "NORMAL";
}

function getPaceSummary(pace: SchedulePace) {
  const settings = schedulePaces[pace];

  return `${settings.title}: ${settings.intervalMin}–${settings.intervalMax} мин`;
}

function parseNyTime(value: string, fallback: { hour: number; minute: number }) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return fallback;

  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));

  return { hour, minute };
}

export default function SuperUploadPage() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [donorInput, setDonorInput] = useState("");
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [donors, setDonors] = useState<DonorChannel[]>([]);
  const [dailyCandidates, setDailyCandidates] = useState<SourceVideo[]>([]);
  const [accounts, setAccounts] = useState<FactoryAccount[]>([]);
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<SourceVideo | null>(null);
  const [isDailyPackageModalOpen, setIsDailyPackageModalOpen] = useState(false);
  const [clipsCount, setClipsCount] = useState(10);
  const [clipLengthMode, setClipLengthMode] = useState<ClipLengthMode>("FULL");
  const [customClipMinSeconds, setCustomClipMinSeconds] = useState(15);
  const [customClipMaxSeconds, setCustomClipMaxSeconds] = useState(25);
  const [hookPreviewSeconds, setHookPreviewSeconds] = useState<7 | 8 | 10>(8);
  const [schedulePace, setSchedulePace] = useState<SchedulePace>("NORMAL");
  const [intervalMin, setIntervalMin] = useState(45);
  const [intervalMax, setIntervalMax] = useState(60);
  const [windowStartTime, setWindowStartTime] = useState("21:30");
  const [windowEndTime, setWindowEndTime] = useState("23:45");
  const [hookMode, setHookMode] = useState("AUTO_BEST_MIX");
  const [onlyUnused, setOnlyUnused] = useState(true);
  const [minChance, setMinChance] = useState(50);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAddingDonor, setIsAddingDonor] = useState(false);
  const [isCheckingDonors, setIsCheckingDonors] = useState(false);
  const [isCreatingDayPackage, setIsCreatingDayPackage] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadAccounts() {
    const response = await fetch("/api/factory/accounts", {
      cache: "no-store",
    });
    const nextData = (await response.json()) as { accounts: FactoryAccount[] };

    setAccounts(nextData.accounts ?? []);

    const youtube = nextData.accounts.find((account) => account.platform === "YOUTUBE");
    if (youtube && !selectedAccountId) {
      setSelectedAccountId(youtube.id);
    }
  }

  async function loadTemplates() {
    const response = await fetch("/api/factory/templates", {
      cache: "no-store",
    });
    const nextData = (await response.json()) as { templates: FactoryTemplate[] };

    setTemplates(nextData.templates ?? []);

    const defaultTemplateId = getDefaultTemplateId(nextData.templates ?? []);
    if (defaultTemplateId && !selectedTemplateId) {
      setSelectedTemplateId(defaultTemplateId);
    }
  }

  async function loadDonors() {
    const response = await fetch("/api/factory/super-upload/donors", {
      cache: "no-store",
    });
    const nextData = (await response.json()) as DonorsResponse;

    if (!response.ok) {
      throw new Error(nextData.error ?? "Не получилось загрузить доноров");
    }

    setDonors(nextData.donors ?? []);
    setDailyCandidates(nextData.candidates ?? []);
  }

  useEffect(() => {
    loadAccounts().catch(console.error);
    loadTemplates().catch(console.error);
    loadDonors().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredVideos = useMemo(() => {
    return (data?.videos ?? []).filter((video) => {
      if (onlyUnused && video.isUsed) return false;
      if (video.viralChance < minChance) return false;
      return true;
    });
  }, [data, onlyUnused, minChance]);

  const summary = useMemo(() => {
    const videos = data?.videos ?? [];
    const available = videos.filter((video) => !video.isUsed);
    const hot = available.filter((video) => video.viralChance >= 75);
    const best = available[0];

    return {
      total: videos.length,
      available: available.length,
      hot: hot.length,
      best,
    };
  }, [data]);

  const clipLengthRange = useMemo(
    () =>
      getClipLengthRange({
        mode: clipLengthMode,
        customMin: customClipMinSeconds,
        customMax: customClipMaxSeconds,
      }),
    [clipLengthMode, customClipMinSeconds, customClipMaxSeconds],
  );

  async function addDonor() {
    setIsAddingDonor(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/factory/super-upload/donors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceUrl: donorInput,
        }),
      });
      const nextData = (await response.json()) as DonorsResponse & { donor?: DonorChannel };

      if (!response.ok) {
        throw new Error(nextData.error ?? "Не получилось добавить донора");
      }

      setDonorInput("");
      await loadDonors();
      setMessage(nextData.message ?? "Донор сохранен и проверен");
    } catch (donorError) {
      setError(
        donorError instanceof Error
          ? donorError.message
          : "Не получилось добавить донора",
      );
    } finally {
      setIsAddingDonor(false);
    }
  }

  async function removeDonor(donor: DonorChannel) {
    setError("");

    try {
      const response = await fetch("/api/factory/super-upload/donors", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: donor.id }),
      });
      const nextData = (await response.json()) as DonorsResponse;

      if (!response.ok) {
        throw new Error(nextData.error ?? "Не получилось выключить донора");
      }

      await loadDonors();
      setMessage(`Донор выключен: ${donor.channelTitle}`);
    } catch (donorError) {
      setError(
        donorError instanceof Error
          ? donorError.message
          : "Не получилось выключить донора",
      );
    }
  }

  async function checkAllDonors() {
    setIsCheckingDonors(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/factory/super-upload/donors/check", {
        method: "POST",
      });
      const nextData = (await response.json()) as DonorsResponse & {
        checked?: number;
        errors?: Array<{ message: string }>;
      };

      if (!response.ok) {
        throw new Error(nextData.error ?? "Не получилось проверить доноров");
      }

      await loadDonors();
      setMessage(
        `Доноры проверены: ${nextData.checked ?? 0}. Кандидатов дня: ${nextData.candidates?.length ?? 0}.`,
      );
    } catch (checkError) {
      setError(
        checkError instanceof Error
          ? checkError.message
          : "Не получилось проверить доноров",
      );
    } finally {
      setIsCheckingDonors(false);
    }
  }

  function openDailyPackageModal() {
    const nextClipsCount = Math.min(10, Math.max(1, dailyCandidates.length || 10));
    const nextPace = getRecommendedPace(nextClipsCount);
    const paceSettings = schedulePaces[nextPace];

    setSelectedVideo(null);
    setIsDailyPackageModalOpen(true);
    setClipsCount(nextClipsCount);
    setClipLengthMode("FULL");
    setHookPreviewSeconds(8);
    setHookMode("AUTO_BEST_MIX");
    setSchedulePace(nextPace);
    setIntervalMin(paceSettings.intervalMin);
    setIntervalMax(paceSettings.intervalMax);
    setWindowStartTime("21:30");
    setWindowEndTime("23:45");
    setMessage("");
    setError("");
  }

  async function createDayPackage() {
    setIsCreatingDayPackage(true);
    setError("");
    setMessage("");

    try {
      if (!selectedAccountId) {
        throw new Error("Выбери YouTube-аккаунт для залива");
      }

      if (!selectedTemplateId) {
        throw new Error("Выбери Amelia-шаблон");
      }

      const windowStart = parseNyTime(windowStartTime, { hour: 21, minute: 30 });
      const windowEnd = parseNyTime(windowEndTime, { hour: 23, minute: 45 });
      const clipRange = getClipLengthRange({
        mode: clipLengthMode,
        customMin: customClipMinSeconds,
        customMax: customClipMaxSeconds,
      });

      const response = await fetch("/api/factory/super-upload/daily-package", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountId: selectedAccountId,
          templateId: selectedTemplateId,
          candidatesCount: clipsCount,
          clipSeconds: clipRange.max,
          clipMinSeconds: clipRange.min,
          clipMaxSeconds: clipRange.max,
          clipLengthMode,
          hookPreviewSeconds,
          intervalMin,
          intervalMax,
          windowStartHour: windowStart.hour,
          windowStartMinute: windowStart.minute,
          windowEndHour: windowEnd.hour,
          windowEndMinute: windowEnd.minute,
          fitInsideWindow: true,
        }),
      });
      const nextData = (await response.json()) as DailyPackageResponse;

      if (!response.ok) {
        throw new Error(nextData.error ?? "Не получилось собрать пакет дня");
      }

      await loadDonors();
      setIsDailyPackageModalOpen(false);
      setMessage(nextData.message ?? `Пакет дня создан: ${nextData.jobs?.length ?? 0} задач.`);
    } catch (packageError) {
      setError(
        packageError instanceof Error
          ? packageError.message
          : "Не получилось собрать пакет дня",
      );
    } finally {
      setIsCreatingDayPackage(false);
    }
  }

  async function analyze() {
    setIsAnalyzing(true);
    setError("");
    setMessage("");
    setSelectedVideo(null);

    try {
      const response = await fetch("/api/factory/super-upload/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceUrl,
        }),
      });

      const nextData = (await response.json()) as AnalyzeResponse;

      if (!response.ok) {
        throw new Error(nextData.error ?? "Не получилось проанализировать канал");
      }

      setData(nextData);
      setMessage(`Найдено и пересчитано видео: ${nextData.totalSeen}`);
    } catch (analyzeError) {
      setError(
        analyzeError instanceof Error
          ? analyzeError.message
          : "Не получилось проанализировать канал",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function markUsed(video: SourceVideo, isUsed: boolean) {
    setError("");

    try {
      const response = await fetch("/api/factory/super-upload/mark-used", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: video.id,
          isUsed,
        }),
      });

      const nextData = (await response.json()) as { video?: SourceVideo; error?: string };

      if (!response.ok) {
        throw new Error(nextData.error ?? "Не получилось обновить видео");
      }

      setData((current) => {
        if (!current || !nextData.video) return current;

        return {
          ...current,
          videos: current.videos.map((item) =>
            item.id === video.id ? { ...item, ...nextData.video } : item,
          ),
        };
      });
    } catch (markError) {
      setError(
        markError instanceof Error
          ? markError.message
          : "Не получилось обновить видео",
      );
    }
  }

  function openPackageModal(video: SourceVideo) {
    const nextClipsCount = video.suggestedClips || 10;
    const nextPace = getRecommendedPace(nextClipsCount);
    const paceSettings = schedulePaces[nextPace];

    setSelectedVideo(video);
    setClipsCount(nextClipsCount);
    setHookMode(video.suggestedHookMode || "AUTO_BEST_MIX");
    setClipLengthMode("FULL");
    setHookPreviewSeconds(8);
    setSchedulePace(nextPace);
    setIntervalMin(paceSettings.intervalMin);
    setIntervalMax(paceSettings.intervalMax);
    setWindowStartTime("21:30");
    setWindowEndTime("23:45");
    setMessage("");
    setError("");
  }

  async function createPackage() {
    if (!selectedVideo) return;

    setIsCreating(true);
    setError("");
    setMessage("");

    try {
      if (!selectedAccountId) {
        throw new Error("Выбери YouTube-аккаунт для залива");
      }

      if (!selectedTemplateId) {
        throw new Error("Выбери Amelia-шаблон");
      }

      const windowStart = parseNyTime(windowStartTime, { hour: 21, minute: 30 });
      const windowEnd = parseNyTime(windowEndTime, { hour: 23, minute: 45 });
      const clipRange = getClipLengthRange({
        mode: clipLengthMode,
        customMin: customClipMinSeconds,
        customMax: customClipMaxSeconds,
      });

      const response = await fetch("/api/factory/super-upload/create-package", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceVideoDbId: selectedVideo.id,
          accountId: selectedAccountId,
          templateId: selectedTemplateId,
          clipsCount,
          clipSeconds: clipRange.max,
          clipMinSeconds: clipRange.min,
          clipMaxSeconds: clipRange.max,
          clipLengthMode,
          hookPreviewSeconds,
          intervalMin,
          intervalMax,
          windowStartHour: windowStart.hour,
          windowStartMinute: windowStart.minute,
          windowEndHour: windowEnd.hour,
          windowEndMinute: windowEnd.minute,
          fitInsideWindow: true,
          hookMode,
          titlePrefix: "auto mix",
        }),
      });

      const nextData = (await response.json()) as PackageResponse;

      if (!response.ok) {
        throw new Error(nextData.error ?? "Не получилось создать пакет");
      }

      setMessage(
        `Пакет создан: ${nextData.jobs?.length ?? 0} задач. Окно NY: ${windowStartTime}–${windowEndTime}.`,
      );
      setSelectedVideo(null);
      await markUsed(selectedVideo, true);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не получилось создать пакет",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="page">
      <div className="shell super-shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/super-upload">СУПЕР ЗАЛИВ</Link>
          <Link href="/factory/story-shorts">Story Shorts</Link>
          <Link href="/factory/movie-moments">Movie Moments</Link>
          <Link href="/factory/music">Музыка</Link>
          <Link href="/factory/long-video">Видео 16:9</Link>
          <Link href="/factory/analytics">Аналитика</Link>
          <Link href="/factory/assets">Видео персонажей</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/thumbnails">Превью</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card super-hero">
          <div>
            <span className="super-eyebrow">Roblox intelligence system</span>
            <h1>СУПЕР ЗАЛИВ</h1>
            <p>
              Вставь канал Roblox-ютубера. Система найдет лучшие source videos,
              посчитает шанс на залет, а при создании пакета включит AI Hook Cut:
              FFmpeg найдет динамичные моменты, OpenAI выберет самый цепляющий hook,
              первые 7–10 секунд будут full-screen Roblox с текстом, а дальше пойдет gameplay + Amelia.
            </p>
          </div>

          <div className="super-hero-card">
            <b>Как льем</b>
            <span>Не пачкой сразу. Пакет разбивается на отдельные задачи.</span>
            <span>Дефолт: 45–60 минут между роликами.</span>
            <span>Окно: вечер/ночь New York на основе /factory/analytics.</span>
          </div>
        </section>

        <section className="card super-control-card super-donors-card">
          <div className="super-section-head">
            <div>
              <span className="super-eyebrow">Daily Scout</span>
              <h2>Горячие доноры</h2>
              <p className="muted">
                Добавляй сколько угодно Roblox-каналов. Система защищает от дублей по channelId,
                каждый день проверяет свежие видео и собирает 10 кандидатов дня.
              </p>
            </div>
            <button type="button" onClick={checkAllDonors} disabled={isCheckingDonors || donors.length === 0}>
              {isCheckingDonors ? "Проверяю доноров..." : "Проверить всех доноров"}
            </button>
          </div>

          <div className="super-donor-add-row">
            <input
              value={donorInput}
              onChange={(event) => setDonorInput(event.target.value)}
              placeholder="https://www.youtube.com/@robloxchannel"
            />
            <button type="button" onClick={addDonor} disabled={isAddingDonor || !donorInput.trim()}>
              {isAddingDonor ? "Добавляю..." : "+ Добавить донора"}
            </button>
          </div>

          <div className="super-donor-list">
            {donors.map((donor) => (
              <div className={`super-donor-card ${donor.isActive ? "" : "used"}`} key={donor.id}>
                <div>
                  <b>{donor.channelTitle}</b>
                  <span>{formatNumber(donor.subscriberCount)} subs · {formatNumber(donor.videoCount)} videos</span>
                  <span>last check: {formatDate(donor.lastCheckedAt)}</span>
                  {donor.lastError ? <span className="error">{donor.lastError}</span> : null}
                </div>
                <button type="button" className="secondary-button" onClick={() => removeDonor(donor)}>
                  Выключить
                </button>
              </div>
            ))}

            {donors.length === 0 ? (
              <p className="muted">Доноров пока нет. Нажми плюс и добавь первый Roblox-канал.</p>
            ) : null}
          </div>

          <div className="super-daily-head">
            <div>
              <h2>Сегодня брать это</h2>
              <p className="muted">
                10 лучших неиспользованных source videos от горячих доноров. Хук выбирается по названию:
                obby/parkour → Impossible + Suspense, escape/survive → Survival + Ending,
                funny/fail → Funny + Fail, doors/horror → Suspense + Ending.
              </p>
            </div>
            <button type="button" onClick={openDailyPackageModal} disabled={dailyCandidates.length === 0}>
              Собрать пакет дня
            </button>
          </div>

          <div className="super-candidate-strip">
            {dailyCandidates.slice(0, 10).map((video, index) => (
              <article className="super-candidate-card" key={video.id}>
                <span className={scoreClass(video.viralChance)}>{video.viralChance}/100</span>
                <b>#{index + 1} {video.title}</b>
                <span>{video.channelTitle ?? "Donor"}</span>
                <span>{formatNumber(video.viewsPerDay)} views/day · {video.suggestedHookMode}</span>
                <span>{video.isUsed ? "Уже использовано" : "Свежий кандидат"}</span>
              </article>
            ))}

            {dailyCandidates.length === 0 ? (
              <p className="muted">Кандидатов дня пока нет. Добавь доноров и нажми “Проверить всех доноров”.</p>
            ) : null}
          </div>
        </section>

        <section className="card super-control-card">
          <label>
            Ссылка на канал / видео / @handle
            <input
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://www.youtube.com/@robloxchannel"
            />
          </label>

          <div className="super-actions-row">
            <button type="button" onClick={analyze} disabled={isAnalyzing || !sourceUrl.trim()}>
              {isAnalyzing ? "Анализирую..." : "Проанализировать канал"}
            </button>

            <label className="super-filter-check">
              <input
                type="checkbox"
                checked={onlyUnused}
                onChange={(event) => setOnlyUnused(event.target.checked)}
              />
              Только не использованные
            </label>

            <label className="super-inline-label">
              Минимальный шанс
              <input
                type="number"
                min={0}
                max={100}
                value={minChance}
                onChange={(event) => setMinChance(Number(event.target.value) || 0)}
              />
            </label>
          </div>

          {message ? <p className="success">{message}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>

        {data ? (
          <>
            <section className="super-summary-grid">
              <div className="analytics-summary-card">
                <span>Канал</span>
                <b>{data.channel.title}</b>
              </div>
              <div className="analytics-summary-card">
                <span>Найдено видео</span>
                <b>{formatNumber(summary.total)}</b>
              </div>
              <div className="analytics-summary-card">
                <span>Доступно без повторов</span>
                <b>{formatNumber(summary.available)}</b>
              </div>
              <div className="analytics-summary-card">
                <span>Сильных кандидатов</span>
                <b>{formatNumber(summary.hot)}</b>
              </div>
            </section>

            <section className="analytics-panel recommendations-panel">
              <h2>Рекомендации системы</h2>
              <div className="recommendation-list">
                {data.recommendations.map((item) => (
                  <div className="recommendation-item" key={item}>
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section className="card super-table-card">
              <h2>Какие видео брать</h2>

              <div className="super-video-list">
                {filteredVideos.map((video) => (
                  <article className={`super-video-card ${video.isUsed ? "used" : ""}`} key={video.id}>
                    <div className="super-thumb-wrap">
                      {video.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={video.thumbnailUrl} alt="" />
                      ) : (
                        <div className="super-thumb-empty">NO THUMB</div>
                      )}
                      <span className={scoreClass(video.viralChance)}>{video.viralChance}/100</span>
                    </div>

                    <div className="super-video-body">
                      <div className="super-video-title-row">
                        <h3>{video.title}</h3>
                        {video.isUsed ? <span className="analytics-verdict dead">Уже заливал</span> : null}
                      </div>

                      <div className="super-metrics-grid">
                        <span>views: <b>{formatNumber(video.views)}</b></span>
                        <span>likes: <b>{formatNumber(video.likes)}</b></span>
                        <span>comments: <b>{formatNumber(video.comments)}</b></span>
                        <span>views/day: <b>{formatNumber(video.viewsPerDay)}</b></span>
                        <span>like rate: <b>{formatPercent(video.likeRate)}</b></span>
                        <span>comment rate: <b>{formatPercent(video.commentRate)}</b></span>
                        <span>date: <b>{formatDate(video.publishedAt)}</b></span>
                        <span>duration: <b>{formatDuration(video.durationSeconds)}</b></span>
                      </div>

                      <div className="super-plan-box">
                        <b>План</b>
                        <span>{video.suggestedClips} клипов · {video.suggestedHookMode} · вечер/ночь New York · нормальный 45–60 мин интервал</span>
                      </div>

                      <div className="inline-actions">
                        <a className="button secondary-button" href={video.sourceUrl} target="_blank" rel="noreferrer">
                          Открыть YouTube
                        </a>
                        <button type="button" onClick={() => openPackageModal(video)} disabled={video.isUsed}>
                          Сделать пакет
                        </button>
                        <button type="button" className="secondary-button" onClick={() => markUsed(video, !video.isUsed)}>
                          {video.isUsed ? "Снять отметку" : "Уже заливал"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}

                {filteredVideos.length === 0 ? (
                  <p className="muted">По текущим фильтрам ничего нет.</p>
                ) : null}
              </div>
            </section>
          </>
        ) : null}

        {isDailyPackageModalOpen ? (
          <div className="super-modal-backdrop">
            <section className="card super-modal">
              <div className="super-modal-head">
                <div>
                  <span className="super-eyebrow">Пакет дня</span>
                  <h2>Настройка перед созданием</h2>
                  <p>Задачи не создаются сразу. Сначала выбираем количество роликов, длину, hook preview, Amelia-шаблон и темп расписания.</p>
                </div>
                <button type="button" className="secondary-button" onClick={() => setIsDailyPackageModalOpen(false)}>
                  Закрыть
                </button>
              </div>

              <div className="grid grid-2">
                <label>
                  YouTube-аккаунт
                  <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
                    <option value="">Выбери аккаунт</option>
                    {accounts
                      .filter((account) => account.platform === "YOUTUBE")
                      .map((account) => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                  </select>
                </label>

                <label>
                  Amelia-шаблон
                  <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                    <option value="">Выбери шаблон</option>
                    <option value="RANDOM">Random Amelia — чередовать шаблоны</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}{template.isDefault ? " — default" : ""}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Количество роликов
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={clipsCount}
                    onChange={(event) => {
                      const value = Math.max(1, Math.min(30, Number(event.target.value) || 1));
                      const nextPace = getRecommendedPace(value);
                      const settings = schedulePaces[nextPace];

                      setClipsCount(value);
                      setSchedulePace(nextPace);
                      setIntervalMin(settings.intervalMin);
                      setIntervalMax(settings.intervalMax);
                    }}
                  />
                </label>

                <label>
                  Длина ролика
                  <select value={clipLengthMode} onChange={(event) => setClipLengthMode(event.target.value as ClipLengthMode)}>
                    <option value="SHORT">15–25 секунд</option>
                    <option value="MEDIUM">25–35 секунд</option>
                    <option value="LONG">35–45 секунд</option>
                    <option value="FULL">45–60 секунд</option>
                    <option value="CUSTOM">Своя длина</option>
                  </select>
                  <small className="muted">Сейчас: {clipLengthRange.min}–{clipLengthRange.max} сек. Worker раздаст разную длину внутри диапазона.</small>
                </label>

                {clipLengthMode === "CUSTOM" ? (
                  <>
                    <label>
                      Минимум секунд
                      <input
                        type="number"
                        min={10}
                        max={60}
                        value={customClipMinSeconds}
                        onChange={(event) => setCustomClipMinSeconds(clampClipSeconds(Number(event.target.value), 15))}
                      />
                    </label>

                    <label>
                      Максимум секунд
                      <input
                        type="number"
                        min={10}
                        max={60}
                        value={customClipMaxSeconds}
                        onChange={(event) => setCustomClipMaxSeconds(clampClipSeconds(Number(event.target.value), 25))}
                      />
                    </label>
                  </>
                ) : null}

                <label>
                  Длина начального AI hook
                  <select value={hookPreviewSeconds} onChange={(event) => setHookPreviewSeconds(Number(event.target.value) as 7 | 8 | 10)}>
                    <option value={7}>7 секунд — быстрее</option>
                    <option value={8}>8 секунд — оптимально</option>
                    <option value={10}>10 секунд — понятнее момент</option>
                  </select>
                </label>

                <label>
                  Режим расписания
                  <select
                    value={schedulePace}
                    onChange={(event) => {
                      const pace = event.target.value as SchedulePace;
                      const settings = schedulePaces[pace];

                      setSchedulePace(pace);
                      setIntervalMin(settings.intervalMin);
                      setIntervalMax(settings.intervalMax);
                    }}
                  >
                    {Object.entries(schedulePaces).map(([value, settings]) => (
                      <option key={value} value={value}>
                        {settings.title} — {settings.intervalMin}–{settings.intervalMax} мин
                      </option>
                    ))}
                  </select>
                  <small className="muted">{schedulePaces[schedulePace].description}</small>
                </label>

                <label>
                  Окно NY — начало
                  <input
                    type="time"
                    value={windowStartTime}
                    onChange={(event) => setWindowStartTime(event.target.value)}
                  />
                </label>

                <label>
                  Окно NY — конец
                  <input
                    type="time"
                    value={windowEndTime}
                    onChange={(event) => setWindowEndTime(event.target.value)}
                  />
                </label>
              </div>

              <div className="grid grid-2">
                <label>
                  Интервал минимум
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={intervalMin}
                    onChange={(event) => {
                      const value = Number(event.target.value) || 45;
                      setIntervalMin(value);
                      setIntervalMax((current) => Math.max(current, value));
                    }}
                  />
                </label>

                <label>
                  Интервал максимум
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={intervalMax}
                    onChange={(event) =>
                      setIntervalMax(
                        Math.max(intervalMin, Number(event.target.value) || 60),
                      )
                    }
                  />
                </label>
              </div>

              <div className="super-plan-box">
                <b>AI Hook Cut</b>
                <span>
                  Будет взято {clipsCount} кандидатов дня. Длина: {clipLengthRange.min}–{clipLengthRange.max} сек с вариацией между роликами. Каждый ролик: 0–{hookPreviewSeconds} сек full-screen Roblox hook + крупный текст, потом gameplay + выбранная Amelia. Финал приходит к hook-моменту.
                </span>
              </div>

              <div className="super-plan-box">
                <b>Расписание</b>
                <span>
                  Окно New York: {windowStartTime}–{windowEndTime}. Все {clipsCount} роликов будут распределены внутри этого окна. Если роликов много, интервал автоматически сожмется, чтобы ничего не ушло на следующую ночь.
                </span>
              </div>

              <button type="button" onClick={createDayPackage} disabled={isCreatingDayPackage}>
                {isCreatingDayPackage ? "Создаю пакет дня..." : "Создать пакет дня"}
              </button>
            </section>
          </div>
        ) : null}

        {selectedVideo ? (
          <div className="super-modal-backdrop">
            <section className="card super-modal">
              <div className="super-modal-head">
                <div>
                  <span className="super-eyebrow">Создать умный пакет</span>
                  <h2>{selectedVideo.title}</h2>
                  <p>Пакет уйдет на завод отдельными задачами: не пачкой сразу, а по вечернему/ночному окну New York с выбранным интервалом.</p>
                </div>
                <button type="button" className="secondary-button" onClick={() => setSelectedVideo(null)}>
                  Закрыть
                </button>
              </div>

              <div className="grid grid-2">
                <label>
                  YouTube-аккаунт
                  <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
                    <option value="">Выбери аккаунт</option>
                    {accounts
                      .filter((account) => account.platform === "YOUTUBE")
                      .map((account) => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                  </select>
                </label>

                <label>
                  Amelia-шаблон
                  <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
                    <option value="">Выбери шаблон</option>
                    <option value="RANDOM">Random Amelia — чередовать шаблоны</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}{template.isDefault ? " — default" : ""}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Количество клипов
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={clipsCount}
                    onChange={(event) => {
                      const value = Math.max(1, Math.min(30, Number(event.target.value) || 1));
                      const nextPace = getRecommendedPace(value);
                      const settings = schedulePaces[nextPace];

                      setClipsCount(value);
                      setSchedulePace(nextPace);
                      setIntervalMin(settings.intervalMin);
                      setIntervalMax(settings.intervalMax);
                    }}
                  />
                </label>

                <label>
                  Длина клипа
                  <select value={clipLengthMode} onChange={(event) => setClipLengthMode(event.target.value as ClipLengthMode)}>
                    <option value="SHORT">15–25 секунд</option>
                    <option value="MEDIUM">25–35 секунд</option>
                    <option value="LONG">35–45 секунд</option>
                    <option value="FULL">45–60 секунд</option>
                    <option value="CUSTOM">Своя длина</option>
                  </select>
                  <small className="muted">Сейчас: {clipLengthRange.min}–{clipLengthRange.max} сек. Worker раздаст разную длину внутри диапазона.</small>
                </label>

                {clipLengthMode === "CUSTOM" ? (
                  <>
                    <label>
                      Минимум секунд
                      <input
                        type="number"
                        min={10}
                        max={60}
                        value={customClipMinSeconds}
                        onChange={(event) => setCustomClipMinSeconds(clampClipSeconds(Number(event.target.value), 15))}
                      />
                    </label>

                    <label>
                      Максимум секунд
                      <input
                        type="number"
                        min={10}
                        max={60}
                        value={customClipMaxSeconds}
                        onChange={(event) => setCustomClipMaxSeconds(clampClipSeconds(Number(event.target.value), 25))}
                      />
                    </label>
                  </>
                ) : null}

                <label>
                  Длина начального AI hook
                  <select value={hookPreviewSeconds} onChange={(event) => setHookPreviewSeconds(Number(event.target.value) as 7 | 8 | 10)}>
                    <option value={7}>7 секунд — для 30 сек роликов</option>
                    <option value={8}>8 секунд — оптимально</option>
                    <option value={10}>10 секунд — максимум интриги</option>
                  </select>
                </label>

                <label>
                  Режим расписания
                  <select
                    value={schedulePace}
                    onChange={(event) => {
                      const pace = event.target.value as SchedulePace;
                      const settings = schedulePaces[pace];

                      setSchedulePace(pace);
                      setIntervalMin(settings.intervalMin);
                      setIntervalMax(settings.intervalMax);
                    }}
                  >
                    {Object.entries(schedulePaces).map(([value, settings]) => (
                      <option key={value} value={value}>
                        {settings.title} — {settings.intervalMin}–{settings.intervalMax} мин
                      </option>
                    ))}
                  </select>
                  <small className="muted">
                    {schedulePaces[schedulePace].description}
                  </small>
                </label>

                <label>
                  Окно NY — начало
                  <input
                    type="time"
                    value={windowStartTime}
                    onChange={(event) => setWindowStartTime(event.target.value)}
                  />
                </label>

                <label>
                  Окно NY — конец
                  <input
                    type="time"
                    value={windowEndTime}
                    onChange={(event) => setWindowEndTime(event.target.value)}
                  />
                </label>

                <label>
                  Интервал минимум
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={intervalMin}
                    onChange={(event) => {
                      const value = Number(event.target.value) || 45;
                      setIntervalMin(value);
                      setIntervalMax((current) => Math.max(current, value));
                    }}
                  />
                </label>

                <label>
                  Интервал максимум
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={intervalMax}
                    onChange={(event) =>
                      setIntervalMax(
                        Math.max(intervalMin, Number(event.target.value) || 60),
                      )
                    }
                  />
                </label>
              </div>

              <div className="super-plan-box">
                <b>AI Hook Cut</b>
                <span>
                  Длина роликов: {clipLengthRange.min}–{clipLengthRange.max} сек с вариацией между задачами. Каждый ролик: 0–{hookPreviewSeconds} сек full-screen Roblox hook + крупный текст,
                  потом split-screen gameplay + Amelia. Основная часть начинается раньше
                  и заканчивается тем самым hook-моментом.
                </span>
              </div>

              <div className="super-plan-box">
                <b>Расписание</b>
                <span>
                  Окно New York: {windowStartTime}–{windowEndTime}. Все {clipsCount} клипов будут распределены внутри выбранного окна без лимита 10 за ночь. Если роликов много, интервал автоматически сожмется.
                </span>
              </div>

              <label>
                Hook strategy для title/описания
                <select value={hookMode} onChange={(event) => setHookMode(event.target.value)}>
                  <option value="AUTO_BEST_MIX">Auto best mix</option>
                  <option value="IMPOSSIBLE_SUSPENSE">Obby / Parkour → Impossible + Suspense</option>
                  <option value="SURVIVAL_ENDING">Escape / Survive → Survival + Ending</option>
                  <option value="FUNNY_FAIL">Funny / Fail → Funny + Fail</option>
                  <option value="SUSPENSE_ENDING">Doors / Horror → Suspense + Ending</option>
                </select>
              </label>

              <button type="button" onClick={createPackage} disabled={isCreating}>
                {isCreating ? "AI ищет hooks и создает пакет..." : "Создать AI Hook пакет"}
              </button>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
