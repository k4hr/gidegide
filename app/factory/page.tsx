"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FactoryPlatform = "YOUTUBE" | "TIKTOK";

type FactoryAccount = {
  id: string;
  platform: FactoryPlatform;
  name: string;
};

type FactoryJob = {
  id: string;
  sourceUrl: string | null;
  sourceOriginalName: string | null;
  clipSeconds: number;
  titlePrefix: string;
  status: string;
  error: string | null;
  totalClips: number;
  progress: number;
  progressLabel: string | null;
  createdAt: string;
  targets: {
    id: string;
    platform: FactoryPlatform;
    account: FactoryAccount;
  }[];
  clips: {
    id: string;
    index: number;
    title: string;
    publishes: {
      id: string;
      platform: FactoryPlatform;
      status: string;
      platformUrl: string | null;
      error: string | null;
      account: FactoryAccount | null;
    }[];
  }[];
};

type JobsResponse = {
  jobs?: FactoryJob[];
  error?: string;
};

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    QUEUED: "В очереди",
    DOWNLOADING: "Скачивается",
    RENDERING: "Рендерится",
    PUBLISHING: "Публикуется",
    DONE: "Готово",
    FAILED: "Ошибка",
    CANCELED: "Отменено",
  };

  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (status === "DONE") return "factory-status-ok";
  if (status === "FAILED" || status === "CANCELED") return "factory-status-danger";
  return "factory-status-warn";
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getSourceTitle(job: FactoryJob) {
  return job.sourceOriginalName || job.titlePrefix || job.sourceUrl || "Без названия";
}

export default function FactoryDashboardPage() {
  const [jobs, setJobs] = useState<FactoryJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelingJobIds, setCancelingJobIds] = useState<string[]>([]);

  async function loadJobs() {
    try {
      setError("");

      const response = await fetch("/api/factory/jobs", {
        cache: "no-store",
      });
      const data = (await response.json()) as JobsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось загрузить задачи");
      }

      setJobs(data.jobs ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не получилось загрузить задачи");
    } finally {
      setIsLoading(false);
    }
  }


  async function cancelJob(jobId: string) {
    const approved = window.confirm("Отменить эту задачу? Если она уже скачивается или рендерится, worker остановит её на ближайшей проверке.");

    if (!approved) return;

    try {
      setError("");
      setCancelingJobIds((current) => Array.from(new Set([...current, jobId])));

      const response = await fetch(`/api/factory/jobs/${jobId}/cancel`, {
        method: "POST",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось отменить задачу");
      }

      await loadJobs();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не получилось отменить задачу");
    } finally {
      setCancelingJobIds((current) => current.filter((id) => id !== jobId));
    }
  }

  function canCancelJob(status: string) {
    return !["DONE", "FAILED", "CANCELED"].includes(status);
  }

  useEffect(() => {
    loadJobs();

    const timer = window.setInterval(() => {
      loadJobs();
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const stats = useMemo(() => {
    const active = jobs.filter((job) => !["DONE", "FAILED", "CANCELED"].includes(job.status)).length;
    const done = jobs.filter((job) => job.status === "DONE").length;
    const failed = jobs.filter((job) => job.status === "FAILED").length;
    const clips = jobs.reduce((sum, job) => sum + (job.totalClips || job.clips.length || 0), 0);

    return { active, done, failed, clips };
  }, [jobs]);

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/super-upload">Супер залив</Link>
          <Link href="/factory/story-shorts">Story Shorts</Link>
          <Link href="/factory/music">Музыка</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
          <Link href="/factory/auto-sources">VK автозабор</Link>
        </nav>

        <section className="factory-hero-card">
          <div>
            <div className="factory-eyebrow">VK CONTENT FACTORY</div>
            <h1>Завод коротких роликов</h1>
            <p>
              Теперь основной сценарий — VK-группы с короткими смешными видео: котики,
              животные, мемы. Добавляешь группы, завод предлагает 2–3 ролика,
              скачивает выбранный исходник, режет его и готовит русские названия.
            </p>
          </div>

          <div className="factory-hero-actions">
            <Link className="factory-primary-button" href="/factory/super-upload">
              Открыть супер залив
            </Link>
            <Link className="factory-secondary-button" href="/factory/accounts">
              Аккаунты
            </Link>
          </div>
        </section>

        <section className="factory-grid-cards dashboard-stats">
          <div className="factory-stat-card">
            <strong>{stats.active}</strong>
            <span>активных задач</span>
          </div>
          <div className="factory-stat-card">
            <strong>{stats.clips}</strong>
            <span>клипов создано</span>
          </div>
          <div className="factory-stat-card">
            <strong>{stats.done}</strong>
            <span>успешно</span>
          </div>
          <div className="factory-stat-card">
            <strong>{stats.failed}</strong>
            <span>ошибок</span>
          </div>
        </section>

        <section className="card">
          <div className="factory-row-between">
            <div>
              <div className="factory-eyebrow">БЫСТРЫЙ СТАРТ</div>
              <h2>Что делать сейчас</h2>
            </div>
            <button className="secondary-button" type="button" onClick={loadJobs}>
              Обновить
            </button>
          </div>

          <div className="factory-grid-cards">
            <Link className="factory-action-card" href="/factory/super-upload">
              <span>01</span>
              <strong>Добавь VK-группы</strong>
              <p>Сохрани группы с короткими роликами: котики, мемы, животные.</p>
            </Link>
            <Link className="factory-action-card" href="/factory/super-upload">
              <span>02</span>
              <strong>Предложи 2–3 видео</strong>
              <p>Система найдет кандидатов и покажет, что можно взять в работу.</p>
            </Link>
            <Link className="factory-action-card" href="/factory/templates">
              <span>03</span>
              <strong>Проверь шаблон</strong>
              <p>Выбери реакцию/персонажа, если используешь нижнюю половину ролика.</p>
            </Link>
          </div>
        </section>

        <section className="card">
          <div className="factory-row-between">
            <div>
              <div className="factory-eyebrow">ЗАДАЧИ</div>
              <h2>Последние запуски</h2>
            </div>
            <div className="factory-muted">Автообновление каждые 5 секунд</div>
          </div>

          {error ? <p className="factory-error-text">{error}</p> : null}
          {isLoading ? <p className="factory-muted">Загружаю задачи...</p> : null}

          {!isLoading && jobs.length === 0 ? (
            <div className="empty-state">
              <strong>Пока задач нет</strong>
              <span>Открой “Супер залив”, добавь VK-группу и возьми видео в работу.</span>
            </div>
          ) : null}

          {jobs.length > 0 ? (
            <div className="factory-table-wrap">
              <table className="factory-table">
                <thead>
                  <tr>
                    <th>Источник</th>
                    <th>Статус</th>
                    <th>Прогресс</th>
                    <th>Клипы</th>
                    <th>Аккаунты</th>
                    <th>Создано</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.slice(0, 12).map((job) => (
                    <tr key={job.id}>
                      <td>
                        <strong>{getSourceTitle(job)}</strong>
                        {job.error ? <small className="factory-error-text">{job.error}</small> : null}
                      </td>
                      <td>
                        <span className={statusClass(job.status)}>{statusLabel(job.status)}</span>
                      </td>
                      <td>
                        <div className="progress-bar">
                          <span style={{ width: `${Math.max(0, Math.min(100, job.progress || 0))}%` }} />
                        </div>
                        <small>{job.progressLabel ?? `${job.progress || 0}%`}</small>
                      </td>
                      <td>{job.totalClips || job.clips.length || "—"}</td>
                      <td>
                        {job.targets.length > 0
                          ? job.targets.map((target) => target.account.name).join(", ")
                          : "—"}
                      </td>
                      <td>{formatDate(job.createdAt)}</td>
                      <td>
                        {canCancelJob(job.status) ? (
                          <button
                            className="factory-cancel-job-button"
                            type="button"
                            title="Отменить задачу"
                            aria-label="Отменить задачу"
                            disabled={cancelingJobIds.includes(job.id)}
                            onClick={() => cancelJob(job.id)}
                          >
                            {cancelingJobIds.includes(job.id) ? "…" : "×"}
                          </button>
                        ) : (
                          <span className="factory-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
