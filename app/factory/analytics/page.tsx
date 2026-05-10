"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Summary = {
  totalVideos: number;
  winners: number;
  dead: number;
  totalViewsNow: number;
  avgScore: number;
  avgRetention: number;
};

type GroupRow = {
  label: string;
  count: number;
  avgViews24h: number;
  avgScore: number;
  winRate: number;
};

type AnalyticsVideo = {
  id: string;
  publishId: string;
  videoId: string;
  url: string | null;
  title: string;
  accountName: string;
  game: string;
  templateName: string;
  clipSeconds: number;
  publishedAt: string | null;
  uploadTimeNy: string;
  viewsNow: number;
  views1h: number;
  views3h: number;
  views6h: number;
  views24h: number;
  views48h: number;
  likesNow: number;
  commentsNow: number;
  sharesNow: number;
  averageViewDuration24h: number;
  averageViewPercentage24h: number;
  estimatedMinutesWatched24h: number;
  subscribersGained24h: number;
  factoryScore: number;
  velocityType: string;
  verdict: string;
  recommendation: string | null;
  lastCheckedAt: string | null;
};

type FailedVideo = {
  id: string;
  publishId: string;
  videoId: string;
  url: string | null;
  title: string;
  accountName: string;
  game: string;
  templateName: string;
  clipSeconds: number;
  uploadTimeNy: string;
  viewsNow: number;
  factoryScore: number;
  recommendation: string | null;
};

type AnalyticsResponse = {
  summary: Summary;
  topVideos: AnalyticsVideo[];
  failedVideos: FailedVideo[];
  groups: {
    byTime: GroupRow[];
    byGame: GroupRow[];
    byTemplate: GroupRow[];
    byLength: GroupRow[];
    byHook: GroupRow[];
  };
  recommendations: string[];
  error?: string;
};

type AnalyticsTab = "TOP" | "FAILED";

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU").format(Math.round(value || 0));
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function verdictClass(verdict: string) {
  if (verdict === "SCALE") return "analytics-verdict scale";
  if (verdict === "WINNER") return "analytics-verdict winner";
  if (verdict === "TEST_MORE") return "analytics-verdict test";
  if (verdict === "DEAD") return "analytics-verdict dead";

  return "analytics-verdict waiting";
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <span className="score-badge">
      {score}
      <small>/100</small>
    </span>
  );
}

function GroupTable({ title, rows }: { title: string; rows: GroupRow[] }) {
  return (
    <section className="analytics-panel">
      <h2>{title}</h2>

      <div className="analytics-mini-table">
        {rows.slice(0, 8).map((row) => (
          <div className="analytics-mini-row" key={row.label}>
            <div>
              <b>{row.label}</b>
              <span>{row.count} роликов</span>
            </div>
            <div>
              <b>{formatNumber(row.avgViews24h)}</b>
              <span>avg 24h views</span>
            </div>
            <div>
              <b>{row.avgScore}</b>
              <span>score</span>
            </div>
            <div>
              <b>{row.winRate}%</b>
              <span>win rate</span>
            </div>
          </div>
        ))}

        {rows.length === 0 ? <p className="muted">Пока нет данных.</p> : null}
      </div>
    </section>
  );
}

export default function FactoryAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("TOP");
  const [deletingPublishId, setDeletingPublishId] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");

  async function loadAnalytics() {
    try {
      setError("");

      const response = await fetch("/api/factory/analytics", {
        cache: "no-store",
      });

      const nextData = (await response.json()) as AnalyticsResponse;

      if (!response.ok) {
        throw new Error(nextData.error ?? "Не получилось загрузить аналитику");
      }

      setData(nextData);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не получилось загрузить аналитику",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteVideoFromChannel(video: FailedVideo) {
    const confirmed = window.confirm(
      `Удалить видео с YouTube-канала?\n\n${video.title}\n\nЭто действие удалит ролик на YouTube и уберет его из аналитики.`,
    );

    if (!confirmed) return;

    setDeletingPublishId(video.publishId);
    setDeleteMessage("");
    setError("");

    try {
      const response = await fetch("/api/factory/analytics/delete-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          publishId: video.publishId,
        }),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        details?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.details ? `${result.error}: ${result.details}` : result.error,
        );
      }

      setDeleteMessage("Видео удалено с канала и убрано из аналитики.");
      await loadAnalytics();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не получилось удалить видео с канала",
      );
    } finally {
      setDeletingPublishId("");
    }
  }

  useEffect(() => {
    loadAnalytics();

    const timer = window.setInterval(() => {
      loadAnalytics();
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const summaryCards = useMemo(() => {
    const summary = data?.summary;

    return [
      {
        label: "Всего роликов",
        value: summary ? formatNumber(summary.totalVideos) : "—",
      },
      {
        label: "Победители",
        value: summary ? formatNumber(summary.winners) : "—",
      },
      {
        label: "Мертвые",
        value: summary ? formatNumber(summary.dead) : "—",
      },
      {
        label: "Все просмотры сейчас",
        value: summary ? formatNumber(summary.totalViewsNow) : "—",
      },
      {
        label: "Средний Factory Score",
        value: summary ? `${summary.avgScore}/100` : "—",
      },
      {
        label: "Среднее удержание",
        value: summary ? `${summary.avgRetention}%` : "—",
      },
    ];
  }, [data]);

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/super-upload">СУПЕР ЗАЛИВ</Link>
          <Link href="/factory/analytics">Аналитика</Link>
          <Link href="/factory/assets">Видео персонажей</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/thumbnails">Превью</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card analytics-hero">
          <div>
            <h1>Factory Analytics</h1>
            <p>
              Amelia + Roblox: просмотры, удержание, watch time, подписчики,
              лучшие часы публикации, лучшие шаблоны, hooks и решение системы —
              что масштабировать дальше.
            </p>
          </div>

          <button type="button" onClick={loadAnalytics} disabled={isLoading}>
            {isLoading ? "Обновляю..." : "Обновить"}
          </button>
        </section>

        {error ? <p className="error">{error}</p> : null}
        {deleteMessage ? <p className="success">{deleteMessage}</p> : null}

        <section className="analytics-summary-grid">
          {summaryCards.map((card) => (
            <div className="analytics-summary-card" key={card.label}>
              <span>{card.label}</span>
              <b>{card.value}</b>
            </div>
          ))}
        </section>

        <section className="analytics-panel recommendations-panel">
          <h2>Что делать дальше</h2>

          {data?.recommendations.length ? (
            <div className="recommendation-list">
              {data.recommendations.map((item) => (
                <div className="recommendation-item" key={item}>
                  {item}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              Пока мало данных. Запусти analytics-worker и дождись первых
              снимков статистики.
            </p>
          )}
        </section>

        <section className="analytics-grid-2">
          <GroupTable
            title="Лучшее время New York"
            rows={data?.groups.byTime ?? []}
          />
          <GroupTable
            title="Лучшие шаблоны Amelia"
            rows={data?.groups.byTemplate ?? []}
          />
          <GroupTable
            title="Лучшие длины"
            rows={data?.groups.byLength ?? []}
          />
          <GroupTable
            title="Лучшие hooks"
            rows={data?.groups.byHook ?? []}
          />
          <GroupTable title="Игры" rows={data?.groups.byGame ?? []} />
        </section>

        <section className="card analytics-table-card">
          <div className="analytics-table-header">
            <div>
              <h2>
                {activeTab === "TOP" ? "Топ роликов" : "Что не зашло"}
              </h2>
              <p className="muted">
                {activeTab === "TOP"
                  ? "Лучшие ролики по Factory Score и просмотрам."
                  : "Слабые ролики. Здесь можно удалить явный провал прямо с YouTube-канала."}
              </p>
            </div>

            <div className="analytics-tabs">
              <button
                type="button"
                className={activeTab === "TOP" ? "active" : ""}
                onClick={() => setActiveTab("TOP")}
              >
                Топ роликов
                <span>{data?.topVideos.length ?? 0}</span>
              </button>

              <button
                type="button"
                className={activeTab === "FAILED" ? "active" : ""}
                onClick={() => setActiveTab("FAILED")}
              >
                Что не зашло
                <span>{data?.failedVideos.length ?? 0}</span>
              </button>
            </div>
          </div>

          {activeTab === "TOP" ? (
            <table className="table analytics-table">
              <thead>
                <tr>
                  <th>Ролик</th>
                  <th>Связка</th>
                  <th>Рост</th>
                  <th>Глубокая аналитика</th>
                  <th>Score</th>
                  <th>Решение</th>
                </tr>
              </thead>

              <tbody>
                {(data?.topVideos ?? []).map((video) => (
                  <tr key={video.id}>
                    <td>
                      <div className="analytics-video-title">
                        {video.url ? (
                          <a href={video.url} target="_blank" rel="noreferrer">
                            {video.title}
                          </a>
                        ) : (
                          <b>{video.title}</b>
                        )}
                        <span>{formatDate(video.publishedAt)}</span>
                        <span>
                          Последняя проверка: {formatDate(video.lastCheckedAt)}
                        </span>
                      </div>
                    </td>

                    <td>
                      <p className="muted">
                        <span className="badge">{video.game}</span>{" "}
                        {video.templateName}
                      </p>
                      <p className="muted">
                        {video.clipSeconds} сек · {video.uploadTimeNy} NY ·{" "}
                        {video.accountName}
                      </p>
                    </td>

                    <td>
                      <div className="analytics-growth-grid">
                        <span>1h: {formatNumber(video.views1h)}</span>
                        <span>3h: {formatNumber(video.views3h)}</span>
                        <span>6h: {formatNumber(video.views6h)}</span>
                        <span>24h: {formatNumber(video.views24h)}</span>
                        <span>48h: {formatNumber(video.views48h)}</span>
                        <b>now: {formatNumber(video.viewsNow)}</b>
                      </div>
                    </td>

                    <td>
                      <div className="analytics-growth-grid">
                        <span>likes: {formatNumber(video.likesNow)}</span>
                        <span>comments: {formatNumber(video.commentsNow)}</span>
                        <span>shares: {formatNumber(video.sharesNow)}</span>
                        <span>
                          watch: {formatNumber(video.estimatedMinutesWatched24h)} min
                        </span>
                        <span>
                          avg dur: {Math.round(video.averageViewDuration24h)} sec
                        </span>
                        <b>
                          retention: {Math.round(video.averageViewPercentage24h)}%
                        </b>
                      </div>
                    </td>

                    <td>
                      <ScoreBadge score={video.factoryScore} />
                      <p className="muted">{video.velocityType}</p>
                    </td>

                    <td>
                      <span className={verdictClass(video.verdict)}>
                        {video.verdict}
                      </span>
                      {video.recommendation ? (
                        <p className="muted">{video.recommendation}</p>
                      ) : null}
                    </td>
                  </tr>
                ))}

                {!isLoading && (data?.topVideos.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      Пока нет аналитики. Должны быть опубликованные YouTube-ролики
                      и запущенный analytics-worker.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <table className="table analytics-table failed-video-table">
              <thead>
                <tr>
                  <th>Ролик</th>
                  <th>Связка</th>
                  <th>Views</th>
                  <th>Score</th>
                  <th>Что делать</th>
                  <th>Удаление</th>
                </tr>
              </thead>

              <tbody>
                {(data?.failedVideos ?? []).map((video) => (
                  <tr key={video.id}>
                    <td>
                      <div className="analytics-video-title">
                        {video.url ? (
                          <a href={video.url} target="_blank" rel="noreferrer">
                            {video.title}
                          </a>
                        ) : (
                          <b>{video.title}</b>
                        )}
                        <span>{video.accountName}</span>
                      </div>
                    </td>
                    <td>
                      {video.game} · {video.templateName} · {video.clipSeconds} сек ·{" "}
                      {video.uploadTimeNy} NY
                    </td>
                    <td>{formatNumber(video.viewsNow)}</td>
                    <td>
                      <ScoreBadge score={video.factoryScore} />
                    </td>
                    <td className="muted">{video.recommendation}</td>
                    <td>
                      <button
                        type="button"
                        className="danger-button"
                        disabled={deletingPublishId === video.publishId}
                        onClick={() => deleteVideoFromChannel(video)}
                      >
                        {deletingPublishId === video.publishId
                          ? "Удаляю..."
                          : "Удалить с канала"}
                      </button>
                    </td>
                  </tr>
                ))}

                {!isLoading && (data?.failedVideos.length ?? 0) === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      Пока нет явных провалов.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
