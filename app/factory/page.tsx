"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SourceMode = "UPLOAD" | "YOUTUBE";
type FactoryGame = "ROBLOX" | "FORTNITE" | "MINECRAFT" | "BRAWL_STARS" | "DOTA2" | "OTHER";

type FactoryTemplate = {
  id: string;
  name: string;
  isDefault: boolean;
};

type FactoryJob = {
  id: string;
  sourceUrl: string | null;
  sourceOriginalName: string | null;
  sourceSizeBytes: number | null;
  clipSeconds: number;
  titlePrefix: string;
  game: FactoryGame;
  platforms: string[];
  status: string;
  error: string | null;
  totalClips: number;
  progress: number;
  progressLabel: string | null;
  cancelRequested: boolean;
  createdAt: string;
  template: FactoryTemplate | null;
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

const gameOptions: Array<{
  value: FactoryGame;
  label: string;
  titlePrefix: string;
}> = [
  { value: "ROBLOX", label: "Roblox", titlePrefix: "Lana watches Roblox" },
  { value: "FORTNITE", label: "Fortnite", titlePrefix: "Lana watches Fortnite" },
  { value: "MINECRAFT", label: "Minecraft", titlePrefix: "Lana watches Minecraft" },
  { value: "BRAWL_STARS", label: "Brawl Stars", titlePrefix: "Lana watches Brawl Stars" },
  { value: "DOTA2", label: "Dota 2", titlePrefix: "Lana watches Dota 2" },
  { value: "OTHER", label: "Other", titlePrefix: "Lana watches games" },
];

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
  const [game, setGame] = useState<FactoryGame>("ROBLOX");
  const [titlePrefix, setTitlePrefix] = useState("Lana watches Roblox");
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [publishYoutube, setPublishYoutube] = useState(true);
  const [publishTikTok, setPublishTikTok] = useState(false);
  const [jobs, setJobs] = useState<FactoryJob[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cancelingJobId, setCancelingJobId] = useState("");
  const [error, setError] = useState("");

  const selectedGame = useMemo(
    () => gameOptions.find((option) => option.value === game) ?? gameOptions[5],
    [game],
  );

  async function loadJobs() {
    const response = await fetch("/api/factory/jobs", {
      cache: "no-store",
    });

    const data = (await response.json()) as {
      jobs: FactoryJob[];
    };

    setJobs(data.jobs);
  }

  async function loadTemplates() {
    const response = await fetch("/api/factory/templates", {
      cache: "no-store",
    });

    const data = (await response.json()) as {
      templates: FactoryTemplate[];
    };

    setTemplates(data.templates);

    const defaultTemplate = data.templates.find((template) => template.isDefault);

    if (!templateId && defaultTemplate) {
      setTemplateId(defaultTemplate.id);
    }
  }

  useEffect(() => {
    loadJobs();
    loadTemplates();

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

  function handleGameChange(nextGame: FactoryGame) {
    const nextGameMeta =
      gameOptions.find((option) => option.value === nextGame) ?? gameOptions[5];

    setGame(nextGame);
    setTitlePrefix(nextGameMeta.titlePrefix);
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
        game,
        titlePrefix,
        templateId: templateId || null,
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
    formData.set("game", game);
    formData.set("titlePrefix", titlePrefix);
    formData.set("templateId", templateId);
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

      if (templates.length === 0) {
        throw new Error("Сначала создай хотя бы один шаблон на странице /factory/templates");
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
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>Lana Content Factory</h1>
          <p>
            Выбираешь игру, шаблон Ланы и источник. Название и 5 хэштегов
            подставляются автоматически по выбранной игре.
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
                Игра
                <select
                  value={game}
                  onChange={(event) =>
                    handleGameChange(event.target.value as FactoryGame)
                  }
                >
                  {gameOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Шаблон Ланы
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                >
                  {templates.length === 0 ? (
                    <option value="">Сначала создай шаблон</option>
                  ) : null}

                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                      {template.isDefault ? " — default" : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

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
                Название ролика
                <input
                  value={titlePrefix}
                  onChange={(event) => setTitlePrefix(event.target.value)}
                  placeholder={selectedGame.titlePrefix}
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

            <p className="muted">
              Для {selectedGame.label} описание будет с 5 хэштегами автоматически.
            </p>

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
                <th>Игра / шаблон</th>
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
                    <span className="badge">{job.game}</span>
                    <p className="muted">{job.template?.name ?? "Default"}</p>
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
                  <td colSpan={5} className="muted">
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
