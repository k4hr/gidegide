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
    subscriberCount: number;
    videoCount: number;
    viewCount: number;
    uploadsPlaylistId: string;
  };
  totalSeen: number;
  videos: SourceVideo[];
  recommendations: string[];
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(value || 0));
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

export default function SuperUploadPage() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [accounts, setAccounts] = useState<FactoryAccount[]>([]);
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<SourceVideo | null>(null);
  const [clipsCount, setClipsCount] = useState(10);
  const [clipSeconds, setClipSeconds] = useState<30 | 45 | 60>(60);
  const [schedulePace, setSchedulePace] = useState<SchedulePace>("NORMAL");
  const [intervalMin, setIntervalMin] = useState(45);
  const [intervalMax, setIntervalMax] = useState(60);
  const [hookMode, setHookMode] = useState("AUTO_BEST_MIX");
  const [onlyUnused, setOnlyUnused] = useState(true);
  const [minChance, setMinChance] = useState(50);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
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

  useEffect(() => {
    loadAccounts().catch(console.error);
    loadTemplates().catch(console.error);
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
    setClipSeconds(60);
    setSchedulePace(nextPace);
    setIntervalMin(paceSettings.intervalMin);
    setIntervalMax(paceSettings.intervalMax);
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
          clipSeconds,
          intervalMin,
          intervalMax,
          hookMode,
          titlePrefix: "auto mix",
        }),
      });

      const nextData = (await response.json()) as PackageResponse;

      if (!response.ok) {
        throw new Error(nextData.error ?? "Не получилось создать пакет");
      }

      setMessage(
        `Пакет создан: ${nextData.jobs?.length ?? 0} задач. Лучшее окно: ${nextData.bestHour}:00 New York.`,
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
              посчитает шанс на залет, предложит hooks, количество клипов и
              создаст умный пакет с публикациями через лучшее окно из аналитики.
            </p>
          </div>

          <div className="super-hero-card">
            <b>Как льем</b>
            <span>Не пачкой сразу. Пакет разбивается на отдельные задачи.</span>
            <span>Дефолт: 45–60 минут между роликами.</span>
            <span>Окно: вечер/ночь New York на основе /factory/analytics.</span>
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
                  <select value={clipSeconds} onChange={(event) => setClipSeconds(Number(event.target.value) as 30 | 45 | 60)}>
                    <option value={30}>30 секунд</option>
                    <option value={45}>45 секунд</option>
                    <option value={60}>60 секунд</option>
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
                  Интервал минимум
                  <input
                    type="number"
                    min={20}
                    max={120}
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
                    min={20}
                    max={180}
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
                <b>Расписание</b>
                <span>
                  {getPaceSummary(schedulePace)} · до 10 роликов в одну ночь,
                  большие пакеты автоматически растягиваются на 2–3 дня.
                </span>
              </div>

              <label>
                Hook strategy
                <select value={hookMode} onChange={(event) => setHookMode(event.target.value)}>
                  <option value="AUTO_BEST_MIX">Auto best mix</option>
                  <option value="ENDING_SURVIVAL_IMPOSSIBLE">Ending + Survival + Impossible</option>
                  <option value="SURVIVAL_SUSPENSE">Survival + Suspense</option>
                  <option value="FUNNY_FAIL">Funny + Fail</option>
                </select>
              </label>

              <button type="button" onClick={createPackage} disabled={isCreating}>
                {isCreating ? "Создаю пакет..." : "Создать умный пакет"}
              </button>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
