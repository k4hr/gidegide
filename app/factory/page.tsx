"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SourceMode = "UPLOAD" | "YOUTUBE";

type FactoryJob = {
  id: string;
  sourceUrl: string | null;
  sourceOriginalName: string | null;
  sourceSizeBytes: number | null;
  clipSeconds: number;
  titlePrefix: string;
  platforms: string[];
  status: string;
  error: string | null;
  totalClips: number;
  progress: number;
  progressLabel: string | null;
  cancelRequested: boolean;
  createdAt: string;
  clips: {
    id: string;
    index: number;
    title: string;
    filePath: string | null;
    storageKey: string | null;
    publishes: {
      id: string;
      platform: string;
      status: string;
      platformUrl: string | null;
      error: string | null;
    }[];
  }[];
};

function canCancel(job: FactoryJob) {
  return !["DONE", "FAILED", "CANCELED"].includes(job.status);
}

function formatMb(bytes: number | null) {
  if (!bytes) return "";

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FactoryPage() {
  const [sourceMode, setSourceMode] = useState<SourceMode>("YOUTUBE");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [clipSeconds, setClipSeconds] = useState("45");
  const [titlePrefix, setTitlePrefix] = useState("Lana watches games");
  const [publishYoutube, setPublishYoutube] = useState(true);
  const [publishTikTok, setPublishTikTok] = useState(false);
  const [jobs, setJobs] = useState<FactoryJob[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cancelingJobId, setCancelingJobId] = useState("");
  const [error, setError] = useState("");

  async function loadJobs() {
    const response = await fetch("/api/factory/jobs", {
      cache: "no-store",
    });

    const data = (await response.json()) as {
      jobs: FactoryJob[];
    };

    setJobs(data.jobs);
  }

  useEffect(() => {
    loadJobs();

    const timer = window.setInterval(() => {
      loadJobs();
    }, 1500);

    return () => window.clearInterval(timer);
  }, []);

  function getPlatforms() {
    const platforms: string[] = [];

    if (publishYoutube) platforms.push("YOUTUBE");
    if (publishTikTok) platforms.push("TIKTOK");

    return platforms;
  }

  async function createYoutubeUrlJob() {
    const response = await fetch("/api/factory/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sourceUrl,
        clipSeconds: Number(clipSeconds),
        titlePrefix,
        platforms: getPlatforms(),
      }),
    });

    const data = (await response.json()) as {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error ?? "Не получилось создать задачу");
    }
  }

  async function createUploadJob() {
    if (!sourceFile) {
      throw new Error("Выбери исходный MP4-файл");
    }

    const formData = new FormData();

    formData.set("sourceFile", sourceFile);
    formData.set("clipSeconds", clipSeconds);
    formData.set("titlePrefix", titlePrefix);
    formData.set("platforms", JSON.stringify(getPlatforms()));

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open("POST", "/api/factory/jobs");

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;

        setUploadProgress(Math.round((event.loaded / event.total) * 100));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }

        try {
          const data = JSON.parse(xhr.responseText) as {
            error?: string;
          };

          reject(new Error(data.error ?? "Не получилось создать задачу"));
        } catch {
          reject(new Error("Не получилось создать задачу"));
        }
      };

      xhr.onerror = () => {
        reject(new Error("Ошибка загрузки файла"));
      };

      xhr.send(formData);
    });
  }

  async function createJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsCreating(true);
    setError("");
    setUploadProgress(0);

    try {
      if (getPlatforms().length === 0) {
        throw new Error("Выбери хотя бы одну платформу");
      }

      if (sourceMode === "UPLOAD") {
        await createUploadJob();
        setSourceFile(null);
      } else {
        await createYoutubeUrlJob();
        setSourceUrl("");
      }

      setUploadProgress(100);
      await loadJobs();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не получилось создать задачу",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function cancelJob(jobId: string) {
    setCancelingJobId(jobId);

    try {
      await fetch(`/api/factory/jobs/${jobId}/cancel`, {
        method: "POST",
      });

      await loadJobs();
    } finally {
      setCancelingJobId("");
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/assets">Видео Ланы</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>Lana Content Factory</h1>
          <p>
            Вставляешь обычную YouTube-ссылку. Система сама открывает RIP-сервис,
            проходит скачивание, получает MP4, режет его, вставляет Лану и
            публикует.
          </p>

          <form className="grid" onSubmit={createJob}>
            <label>
              Источник
              <select
                value={sourceMode}
                onChange={(event) => setSourceMode(event.target.value as SourceMode)}
              >
                <option value="YOUTUBE">YouTube URL → RIP auto downloader</option>
                <option value="UPLOAD">Загрузить MP4 вручную</option>
              </select>
            </label>

            {sourceMode === "UPLOAD" ? (
              <label>
                Исходный MP4
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/*"
                  onChange={(event) =>
                    setSourceFile(event.target.files?.[0] ?? null)
                  }
                  required
                />
              </label>
            ) : (
              <label>
                YouTube URL
                <input
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  required
                />
              </label>
            )}

            {isCreating && sourceMode === "UPLOAD" ? (
              <div className="upload-progress">
                <div className="progress-head">
                  <span>Загрузка исходника</span>
                  <span>{uploadProgress}%</span>
                </div>

                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${uploadProgress}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div className="grid grid-2">
              <label>
                Длина клипа
                <select
                  value={clipSeconds}
                  onChange={(event) => setClipSeconds(event.target.value)}
                >
                  <option value="30">30 секунд</option>
                  <option value="45">45 секунд</option>
                  <option value="60">60 секунд</option>
                </select>
              </label>

              <label>
                Заголовок
                <input
                  value={titlePrefix}
                  onChange={(event) => setTitlePrefix(event.target.value)}
                  placeholder="Lana watches games"
                  required
                />
              </label>
            </div>

            <div className="grid grid-2">
              <label>
                <span>YouTube</span>
                <select
                  value={publishYoutube ? "yes" : "no"}
                  onChange={(event) =>
                    setPublishYoutube(event.target.value === "yes")
                  }
                >
                  <option value="yes">Заливать</option>
                  <option value="no">Не заливать</option>
                </select>
              </label>

              <label>
                <span>TikTok</span>
                <select
                  value={publishTikTok ? "yes" : "no"}
                  onChange={(event) =>
                    setPublishTikTok(event.target.value === "yes")
                  }
                >
                  <option value="no">Пока выключено</option>
                  <option value="yes">Создать publish-задачи</option>
                </select>
              </label>
            </div>

            {error ? <p className="error">{error}</p> : null}

            <button disabled={isCreating}>
              {isCreating ? "Создаю задачу..." : "Generate & Publish"}
            </button>
          </form>
        </section>

        <section style={{ height: 24 }} />

        <section className="card">
          <h2>Задачи</h2>

          <table className="table">
            <thead>
              <tr>
                <th>Прогресс</th>
                <th>Источник</th>
                <th>Клипы</th>
                <th>Публикации</th>
              </tr>
            </thead>

            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <div className="progress-row">
                      <button
                        type="button"
                        className="cancel-button"
                        disabled={!canCancel(job) || cancelingJobId === job.id}
                        onClick={() => cancelJob(job.id)}
                      >
                        {job.cancelRequested || cancelingJobId === job.id
                          ? "Отмена..."
                          : "Отменить"}
                      </button>

                      <div className="progress-block">
                        <div className="progress-head">
                          <span className="badge">{job.status}</span>
                          <span>{Math.round(job.progress ?? 0)}%</span>
                        </div>

                        <div className="progress-track">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${Math.max(
                                0,
                                Math.min(100, job.progress ?? 0),
                              )}%`,
                            }}
                          />
                        </div>

                        <p className="muted">{job.progressLabel ?? "Ожидание"}</p>

                        {job.error ? <p className="error">{job.error}</p> : null}
                      </div>
                    </div>
                  </td>

                  <td>
                    <div style={{ maxWidth: 360, wordBreak: "break-all" }}>
                      {job.sourceOriginalName ?? job.sourceUrl ?? "—"}
                    </div>

                    <p className="muted">
                      {job.sourceSizeBytes ? `${formatMb(job.sourceSizeBytes)} · ` : ""}
                      {job.clipSeconds} сек · {job.platforms.join(", ")}
                    </p>
                  </td>

                  <td>
                    {job.clips.length} / {job.totalClips}
                  </td>

                  <td>
                    {job.clips.flatMap((clip) =>
                      clip.publishes.map((publish) => (
                        <div key={publish.id}>
                          <b>
                            {clip.index}. {publish.platform}
                          </b>{" "}
                          <span className="badge">{publish.status}</span>
                          {publish.platformUrl ? (
                            <>
                              {" "}
                              <a
                                className="success"
                                href={publish.platformUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                открыть
                              </a>
                            </>
                          ) : null}
                          {publish.error ? (
                            <p className="error">{publish.error}</p>
                          ) : null}
                        </div>
                      )),
                    )}
                  </td>
                </tr>
              ))}

              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    Пока задач нет.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
