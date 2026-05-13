"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SourceMode = "UPLOAD" | "YOUTUBE";

type FactoryPlatform = "YOUTUBE" | "TIKTOK";

type FactoryGame =
  | "ROBLOX"
  | "FORTNITE"
  | "MINECRAFT"
  | "BRAWL_STARS"
  | "DOTA2"
  | "OTHER";

type FactoryPublishTiming =
  | "NOW"
  | "NY_14"
  | "NY_17"
  | "NY_20"
  | "NY_22"
  | "USA_SMART";

type FactoryCutMode = "SEQUENTIAL" | "SMART_LITE" | "SMART_HOOK_AI" | "ROBLOX_STORY_AI";
type PublishAction = "DEFAULT" | "USA_SMART";

type FactoryTemplate = {
  id: string;
  name: string;
  isDefault: boolean;
};

type FactoryAccount = {
  id: string;
  platform: FactoryPlatform;
  name: string;
  expiresAt: string | null;
  createdAt: string;
};

type TargetState = {
  enabled: boolean;
  templateId: string;
  titlePrefix: string;
  maxClips: number;
};

type FactoryJob = {
  id: string;
  sourceUrl: string | null;
  sourceOriginalName: string | null;
  sourceSizeBytes: number | null;
  clipSeconds: number;
  clipStartIndex: number;
  titlePrefix: string;
  game: FactoryGame;
  platforms: string[];
  status: string;
  error: string | null;
  totalClips: number;
  progress: number;
  progressLabel: string | null;
  publishTiming: FactoryPublishTiming;
  scheduledAt: string | null;
  cutMode: FactoryCutMode;
  smartStepSeconds: number;
  smartCandidates: number;
  smartMinGapSeconds: number;
  hookPreviewSeconds: number;
  storyStyle?: string;
  storyMinSeconds?: number;
  storyMaxSeconds?: number;
  renderFormat?: "SHORTS_9_16" | "LONG_16_9";
  longVideoTitle?: string | null;
  cancelRequested: boolean;
  createdAt: string;
  targets: {
    id: string;
    platform: FactoryPlatform;
    titlePrefix: string | null;
    maxClips: number;
    account: FactoryAccount;
    template: FactoryTemplate | null;
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
      target: {
        template: FactoryTemplate | null;
      } | null;
    }[];
  }[];
};

const gameOptions: Array<{
  value: FactoryGame;
  label: string;
  titlePrefix: string;
}> = [
  {
    value: "ROBLOX",
    label: "Roblox",
    titlePrefix: "auto mix",
  },
  {
    value: "FORTNITE",
    label: "Fortnite",
    titlePrefix: "auto mix",
  },
  {
    value: "MINECRAFT",
    label: "Minecraft",
    titlePrefix: "auto mix",
  },
  {
    value: "BRAWL_STARS",
    label: "Brawl Stars",
    titlePrefix: "auto mix",
  },
  {
    value: "DOTA2",
    label: "Dota 2",
    titlePrefix: "auto mix",
  },
  {
    value: "OTHER",
    label: "Other",
    titlePrefix: "auto mix",
  },
];

const publishTimingOptions: Array<{
  value: Exclude<FactoryPublishTiming, "USA_SMART">;
  title: string;
  description: string;
}> = [
  {
    value: "NOW",
    title: "Загрузить сейчас",
    description:
      "Worker начнет обработку и публикацию сразу после создания задачи.",
  },
  {
    value: "NY_14",
    title: "14:00 New York = 21:00 МСК",
    description: "Задача будет ждать ближайшее 14:00 по New York time.",
  },
  {
    value: "NY_17",
    title: "17:00 New York = 00:00 МСК",
    description: "Задача будет ждать ближайшее 17:00 по New York time.",
  },
  {
    value: "NY_20",
    title: "20:00 New York = 03:00 МСК",
    description: "Основное вечернее окно для USA-аудитории.",
  },
  {
    value: "NY_22",
    title: "22:00 New York = 05:00 МСК",
    description: "Позднее вечернее окно для USA-аудитории.",
  },
];

function canCancel(job: FactoryJob) {
  return !["DONE", "FAILED", "CANCELED"].includes(job.status);
}

function canRunNow(job: FactoryJob) {
  return job.status === "QUEUED" && Boolean(job.scheduledAt);
}

function formatMb(bytes: number | null) {
  if (!bytes) return "";

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getDefaultTemplateId(templates: FactoryTemplate[]) {
  return (
    templates.find((template) => template.isDefault)?.id ??
    templates[0]?.id ??
    ""
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getPublishTimingLabel(value: FactoryPublishTiming) {
  if (value === "USA_SMART") {
    return "Грамотный залив под USA";
  }

  return (
    publishTimingOptions.find((option) => option.value === value)?.title ??
    "Загрузить сейчас"
  );
}

function getSubmitAction(event: FormEvent<HTMLFormElement>): PublishAction {
  const nativeEvent = event.nativeEvent as SubmitEvent;
  const submitter = nativeEvent.submitter;

  if (submitter instanceof HTMLButtonElement) {
    if (submitter.value === "USA_SMART") return "USA_SMART";
  }

  return "DEFAULT";
}

function getSubmitPublishTiming(
  action: PublishAction,
  fallback: FactoryPublishTiming,
) {
  if (action === "USA_SMART") {
    return "USA_SMART" as const;
  }

  return fallback;
}

export default function FactoryPage() {
  const [sourceMode, setSourceMode] = useState<SourceMode>("YOUTUBE");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [clipSeconds, setClipSeconds] = useState("45");
  const [game, setGame] = useState<FactoryGame>("ROBLOX");
  const [titlePrefix, setTitlePrefix] = useState("auto mix");
  const [publishTiming, setPublishTiming] =
    useState<FactoryPublishTiming>("NOW");

  const cutMode: FactoryCutMode = "SEQUENTIAL";
  const smartStepSeconds = "10";
  const smartCandidates = "80";
  const smartMinGapSeconds = "30";

  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [accounts, setAccounts] = useState<FactoryAccount[]>([]);
  const [targets, setTargets] = useState<Record<string, TargetState>>({});
  const [jobs, setJobs] = useState<FactoryJob[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [cancelingJobId, setCancelingJobId] = useState("");
  const [runningNowJobId, setRunningNowJobId] = useState("");
  const [error, setError] = useState("");

  const selectedGame = useMemo(
    () => gameOptions.find((option) => option.value === game) ?? gameOptions[5],
    [game],
  );

  async function loadJobs() {
    try {
      const response = await fetch("/api/factory/jobs", {
        cache: "no-store",
      });

      const data = (await response.json()) as {
        jobs?: FactoryJob[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось загрузить задачи");
      }

      setJobs(data.jobs ?? []);
    } catch (jobsError) {
      console.error(jobsError);
    }
  }

  async function loadTemplates() {
    try {
      const response = await fetch("/api/factory/templates", {
        cache: "no-store",
      });

      const data = (await response.json()) as {
        templates: FactoryTemplate[];
      };

      setTemplates(data.templates);

      const defaultTemplateId = getDefaultTemplateId(data.templates);

      if (!templateId && defaultTemplateId) {
        setTemplateId(defaultTemplateId);
      }

      setTargets((current) => {
        const next = { ...current };

        for (const accountId of Object.keys(next)) {
          if (!next[accountId].templateId && defaultTemplateId) {
            next[accountId] = {
              ...next[accountId],
              templateId: defaultTemplateId,
            };
          }
        }

        return next;
      });
    } catch (templatesError) {
      console.error(templatesError);
    }
  }

  async function loadAccounts() {
    try {
      const response = await fetch("/api/factory/accounts", {
        cache: "no-store",
      });

      const data = (await response.json()) as {
        accounts: FactoryAccount[];
      };

      setAccounts(data.accounts);

      setTargets((current) => {
        const next = { ...current };
        const defaultTemplateId = templateId || getDefaultTemplateId(templates);

        for (const account of data.accounts) {
          if (!next[account.id]) {
            next[account.id] = {
              enabled: false,
              templateId: defaultTemplateId,
              titlePrefix,
              maxClips: 10,
            };
          }
        }

        return next;
      });
    } catch (accountsError) {
      console.error(accountsError);
    }
  }

  useEffect(() => {
    loadJobs();
    loadTemplates();
    loadAccounts();

    const timer = window.setInterval(() => {
      loadJobs();
    }, 5000);

    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const defaultTemplateId = templateId || getDefaultTemplateId(templates);

    if (!defaultTemplateId) return;

    setTargets((current) => {
      const next = { ...current };

      for (const account of accounts) {
        if (!next[account.id]) {
          next[account.id] = {
            enabled: false,
            templateId: defaultTemplateId,
            titlePrefix,
            maxClips: 10,
          };
        } else if (!next[account.id].templateId) {
          next[account.id] = {
            ...next[account.id],
            templateId: defaultTemplateId,
          };
        }
      }

      return next;
    });
  }, [accounts, templateId, templates, titlePrefix]);

  function handleGameChange(nextGame: FactoryGame) {
    const nextGameMeta =
      gameOptions.find((option) => option.value === nextGame) ?? gameOptions[5];

    setGame(nextGame);
    setTitlePrefix(nextGameMeta.titlePrefix);

    setTargets((current) => {
      const next = { ...current };

      for (const accountId of Object.keys(next)) {
        next[accountId] = {
          ...next[accountId],
          titlePrefix: nextGameMeta.titlePrefix,
        };
      }

      return next;
    });
  }

  function updateTarget(accountId: string, patch: Partial<TargetState>) {
    setTargets((current) => ({
      ...current,
      [accountId]: {
        enabled: current[accountId]?.enabled ?? false,
        templateId:
          current[accountId]?.templateId ||
          templateId ||
          getDefaultTemplateId(templates),
        titlePrefix: current[accountId]?.titlePrefix || titlePrefix,
        maxClips: current[accountId]?.maxClips ?? 10,
        ...patch,
      },
    }));
  }

  function getSelectedTargets() {
    return accounts
      .filter((account) => targets[account.id]?.enabled)
      .map((account) => ({
        accountId: account.id,
        templateId:
          targets[account.id]?.templateId ||
          templateId ||
          getDefaultTemplateId(templates),
        titlePrefix: targets[account.id]?.titlePrefix || titlePrefix,
        maxClips: targets[account.id]?.maxClips ?? 10,
      }));
  }

  function getSmartSettingsPayload() {
    return {
      cutMode,
      smartStepSeconds: Number(smartStepSeconds),
      smartCandidates: Number(smartCandidates),
      smartMinGapSeconds: Number(smartMinGapSeconds),
    };
  }

  async function createYoutubeUrlJob(
    nextPublishTiming: FactoryPublishTiming,
    action: PublishAction,
  ) {
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
        publishTiming: nextPublishTiming,
        packageMode: "NORMAL",
        ...getSmartSettingsPayload(),
        targets: getSelectedTargets(),
      }),
    });

    const data = (await response.json()) as {
      error?: string;
    };

    if (!response.ok) {
      throw new Error(data.error ?? "Не получилось создать задачу");
    }
  }

  async function createUploadJob(
    nextPublishTiming: FactoryPublishTiming,
    action: PublishAction,
  ) {
    if (!sourceFile) {
      throw new Error("Выбери исходный MP4-файл");
    }

    const formData = new FormData();

    formData.set("sourceFile", sourceFile);
    formData.set("clipSeconds", clipSeconds);
    formData.set("game", game);
    formData.set("titlePrefix", titlePrefix);
    formData.set("templateId", templateId);
    formData.set("publishTiming", nextPublishTiming);
    formData.set("packageMode", "NORMAL");
    formData.set("cutMode", cutMode);
    formData.set("smartStepSeconds", smartStepSeconds);
    formData.set("smartCandidates", smartCandidates);
    formData.set("smartMinGapSeconds", smartMinGapSeconds);
    formData.set("targets", JSON.stringify(getSelectedTargets()));

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

  async function createJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const submitAction = getSubmitAction(event);
    const nextPublishTiming = getSubmitPublishTiming(
      submitAction,
      publishTiming,
    );

    setIsCreating(true);
    setError("");
    setUploadProgress(0);

    try {
      if (templates.length === 0) {
        throw new Error(
          "Сначала создай хотя бы один шаблон на странице /factory/templates",
        );
      }

      if (getSelectedTargets().length === 0) {
        throw new Error("Выбери хотя бы один YouTube или TikTok аккаунт");
      }

      if (sourceMode === "UPLOAD") {
        await createUploadJob(nextPublishTiming, submitAction);
        setSourceFile(null);
      } else {
        await createYoutubeUrlJob(nextPublishTiming, submitAction);
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

  async function runJobNow(jobId: string) {
    setRunningNowJobId(jobId);

    try {
      const response = await fetch(`/api/factory/jobs/${jobId}/run-now`, {
        method: "POST",
      });

      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось запустить задачу сейчас");
      }

      await loadJobs();
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "Не получилось запустить задачу сейчас",
      );
    } finally {
      setRunningNowJobId("");
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/super-upload">СУПЕР ЗАЛИВ</Link>
          <Link href="/factory/long-video">Видео 16:9</Link>
          <Link href="/factory/analytics">Аналитика</Link>
          <Link href="/factory/assets">Видео персонажей</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/thumbnails">Превью</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>Lana Content Factory</h1>
          <p>
            Выбираешь игру, источник, время публикации и конкретные аккаунты.
            Завод нарезает исходник подряд, собирает 9:16 ролики и отправляет их
            в очередь публикации.
          </p>

          <form className="grid" onSubmit={createJob}>
            <label>
              Источник
              <select
                value={sourceMode}
                onChange={(event) =>
                  setSourceMode(event.target.value as SourceMode)
                }
              >
                <option value="YOUTUBE">
                  YouTube URL → RIP auto downloader
                </option>
                <option value="UPLOAD">Загрузить MP4 вручную</option>
              </select>
            </label>

            {sourceMode === "UPLOAD" ? (
              <label>
                Исходный MP4
                <input
                  key={sourceFile?.name ?? "empty"}
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
                Шаблон по умолчанию
                <select
                  value={templateId}
                  onChange={(event) => {
                    setTemplateId(event.target.value);
                  }}
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
                Title hook
                <input
                  value={titlePrefix}
                  onChange={(event) => setTitlePrefix(event.target.value)}
                  placeholder="auto mix"
                />
                <small className="muted">
                  Оставь auto mix — завод сам подставит разные цепляющие hooks.
                  Если впишешь свой текст, он будет использоваться вручную.
                </small>
              </label>
            </div>

            <section className="target-panel">
              <h2>Когда публиковать</h2>
              <p className="muted">
                Если выбираешь время New York, задача создастся сразу, но worker
                начнет обработку и публикацию только когда наступит выбранное
                время.
              </p>

              <button
                type="button"
                className={`usa-smart-button ${
                  publishTiming === "USA_SMART" ? "active" : ""
                }`}
                onClick={() => setPublishTiming("USA_SMART")}
              >
                <span>Грамотный залив под USA</span>
                <small>
                  21:00 МСК — ролик 1 · 21:15 МСК — ролик 2 · 23:00 МСК — ролик
                  3 · 23:15 МСК — ролик 4 · 01:00 МСК — ролик 5 · 01:15 МСК —
                  ролик 6 · 03:00 МСК — ролик 7 · 03:15 МСК — ролик 8 · 05:00
                  МСК — ролик 9 · 05:15 МСК — ролик 10
                </small>
              </button>

              <div className="schedule-options">
                {publishTimingOptions.map((option) => (
                  <label
                    className="target-checkbox schedule-option"
                    key={option.value}
                  >
                    <input
                      type="checkbox"
                      checked={publishTiming === option.value}
                      onChange={() => setPublishTiming(option.value)}
                    />

                    <span>
                      <b>{option.title}</b>
                      <small>{option.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="target-panel">
              <h2>Куда публиковать</h2>
              <p className="muted">
                Отметь аккаунты, выбери отдельный шаблон под каждый канал и
                укажи количество роликов для каждого аккаунта.
              </p>

              <div className="target-list">
                {accounts.map((account) => {
                  const state = targets[account.id] ?? {
                    enabled: false,
                    templateId: templateId || getDefaultTemplateId(templates),
                    titlePrefix,
                    maxClips: 10,
                  };

                  return (
                    <div className="target-card" key={account.id}>
                      <label className="target-checkbox">
                        <input
                          type="checkbox"
                          checked={state.enabled}
                          onChange={(event) =>
                            updateTarget(account.id, {
                              enabled: event.target.checked,
                            })
                          }
                        />
                        <span className="badge">{account.platform}</span>
                        <b>{account.name}</b>
                      </label>

                      <div className="target-settings-grid">
                        <label>
                          Шаблон
                          <select
                            value={
                              state.templateId ||
                              templateId ||
                              getDefaultTemplateId(templates)
                            }
                            onChange={(event) =>
                              updateTarget(account.id, {
                                templateId: event.target.value,
                              })
                            }
                          >
                            {templates.map((template) => (
                              <option key={template.id} value={template.id}>
                                {template.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Title hook для аккаунта
                          <input
                            value={state.titlePrefix || ""}
                            onChange={(event) =>
                              updateTarget(account.id, {
                                titlePrefix: event.target.value,
                              })
                            }
                            placeholder="auto mix"
                          />
                          <small className="muted">
                            auto mix = разные цепляющие hooks автоматически.
                          </small>
                        </label>

                        <label>
                          Кол-во видео
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={state.maxClips}
                            onChange={(event) =>
                              updateTarget(account.id, {
                                maxClips: Math.max(
                                  1,
                                  Math.min(
                                    100,
                                    Number(event.target.value) || 1,
                                  ),
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}

                {accounts.length === 0 ? (
                  <p className="muted">
                    Пока нет подключенных аккаунтов. Перейди в /factory/accounts
                    и подключи YouTube или TikTok.
                  </p>
                ) : null}
              </div>
            </section>

            <p className="muted">
              Для {selectedGame.label} title и описание собираются
              автоматически. Если в title hook стоит auto mix, каждый ролик
              получит разный цепляющий заголовок.
            </p>

            {error ? <p className="error">{error}</p> : null}

            <div className="submit-actions">
              <button
                name="publishAction"
                value="DEFAULT"
                disabled={isCreating}
              >
                {isCreating ? "Создаю задачу..." : "Generate & Publish"}
              </button>

              <button
                name="publishAction"
                value="USA_SMART"
                className="secondary-button"
                disabled={isCreating}
              >
                {isCreating ? "Создаю USA-пакет..." : "Грамотный залив под USA"}
              </button>
            </div>
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
                <th>Аккаунты</th>
                <th>Клипы</th>
                <th>Публикации</th>
              </tr>
            </thead>

            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <div className="progress-row">
                      <div className="progress-actions">
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

                        {canRunNow(job) ? (
                          <button
                            type="button"
                            className="run-now-button"
                            disabled={runningNowJobId === job.id}
                            onClick={() => runJobNow(job.id)}
                          >
                            {runningNowJobId === job.id
                              ? "Запускаю..."
                              : "Загрузить сейчас"}
                          </button>
                        ) : null}
                      </div>

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

                        <p className="muted">
                          {job.progressLabel ?? "Ожидание"}
                        </p>

                        {job.scheduledAt ? (
                          <p className="muted">
                            Запланировано: {formatDateTime(job.scheduledAt)}
                          </p>
                        ) : null}

                        {job.error ? (
                          <p className="error">{job.error}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  <td>
                    <div style={{ maxWidth: 360, wordBreak: "break-all" }}>
                      {job.sourceOriginalName ?? job.sourceUrl ?? "—"}
                    </div>

                    <p className="muted">
                      {job.sourceSizeBytes
                        ? `${formatMb(job.sourceSizeBytes)} · `
                        : ""}
                      {job.clipSeconds} сек
                    </p>

                    <p className="muted">
                      {getPublishTimingLabel(job.publishTiming)}
                    </p>

                    <p className="muted">
                      {job.renderFormat === "LONG_16_9"
                        ? "Видео 16:9 · full video · facecam reaction"
                        : job.cutMode === "ROBLOX_STORY_AI"
                          ? `Roblox Story Shorts · AI длина ${job.storyMinSeconds ?? 10}-${job.storyMaxSeconds ?? 35} сек · ${job.storyStyle ?? "AUTO"}`
                          : job.cutMode === "SMART_HOOK_AI"
                            ? `AI Hook Cut · hook ${job.hookPreviewSeconds ?? 8} сек · кандидатов ${job.smartCandidates}`
                            : job.cutMode === "SMART_LITE"
                            ? `Smart Cut Lite · шаг ${job.smartStepSeconds} сек · кандидатов ${job.smartCandidates}`
                            : "Обычная нарезка подряд"}
                    </p>

                    {job.clipStartIndex > 0 ? (
                      <p className="muted">
                        Смещение: ролик #{job.clipStartIndex + 1}
                      </p>
                    ) : null}
                  </td>

                  <td>
                    {job.targets.map((target) => (
                      <p key={target.id} className="muted">
                        <span className="badge">{target.platform}</span>{" "}
                        {target.account.name} ·{" "}
                        {target.template?.name ?? "Default"} · {target.maxClips}{" "}
                        видео
                      </p>
                    ))}
                  </td>

                  <td>
                    {job.clips.length} / {job.totalClips}
                  </td>

                  <td>
                    {job.clips.flatMap((clip) =>
                      clip.publishes.map((publish) => (
                        <div key={publish.id}>
                          <b>
                            {clip.index}.{" "}
                            {publish.account?.name ?? publish.platform}
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
