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
  kind?: "SHORTS_9_16" | "LONG_16_9";
};

type MovieDonor = {
  id: string;
  channelId: string;
  channelTitle: string;
  sourceUrl: string;
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
  isActive: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
};

type MovieCandidate = {
  id: string;
  sourceVideoId: string;
  sourceUrl: string;
  channelTitle: string | null;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
  publishedAt?: string | null;
  views: number;
  viewsPerDay: number;
  viralChance: number;
  suggestedClips: number;
  isUsed: boolean;
};

const clipCountOptions = [3, 4, 5, 10];
const clipLengthOptions = [
  { label: "15 секунд", value: 15 },
  { label: "20 секунд", value: 20 },
  { label: "25 секунд", value: 25 },
  { label: "35 секунд", value: 35 },
  { label: "45 секунд", value: 45 },
  { label: "60 секунд", value: 60 },
];

function formatDuration(seconds?: number | null) {
  if (!seconds) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const sec = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${minutes}:${String(sec).padStart(2, "0")}`;
}

function formatNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0";
  return new Intl.NumberFormat("ru-RU").format(Math.round(parsed));
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

export default function MovieMomentsPage() {
  const [accounts, setAccounts] = useState<FactoryAccount[]>([]);
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [donors, setDonors] = useState<MovieDonor[]>([]);
  const [candidates, setCandidates] = useState<MovieCandidate[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [movieTitle, setMovieTitle] = useState("");
  const [description, setDescription] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [clipCount, setClipCount] = useState(4);
  const [youtubeClipsPerMovie, setYoutubeClipsPerMovie] = useState(3);
  const [clipSeconds, setClipSeconds] = useState(25);
  const [accountId, setAccountId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [channelLoading, setChannelLoading] = useState(false);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const youtubeAccounts = useMemo(
    () => accounts.filter((account) => account.platform === "YOUTUBE"),
    [accounts],
  );

  const shortsTemplates = useMemo(() => {
    const shortsOnly = templates.filter((template) => !template.kind || template.kind === "SHORTS_9_16");
    return shortsOnly.length > 0 ? shortsOnly : templates;
  }, [templates]);

  async function loadData() {
    const [accountsResponse, templatesResponse, channelsResponse] = await Promise.all([
      fetch("/api/factory/accounts", { cache: "no-store" }),
      fetch("/api/factory/templates", { cache: "no-store" }),
      fetch("/api/factory/movie-moments/channels", { cache: "no-store" }),
    ]);

    const accountsData = (await accountsResponse.json()) as { accounts: FactoryAccount[] };
    const templatesData = (await templatesResponse.json()) as { templates: FactoryTemplate[] };
    const channelsData = (await channelsResponse.json()) as {
      donors?: MovieDonor[];
      candidates?: MovieCandidate[];
      error?: string;
    };

    if (!channelsResponse.ok) {
      throw new Error(channelsData.error ?? "Не получилось загрузить movie-каналы");
    }

    setAccounts(accountsData.accounts ?? []);
    setTemplates(templatesData.templates ?? []);
    setDonors(channelsData.donors ?? []);
    setCandidates(channelsData.candidates ?? []);
    setSelectedCandidateIds((channelsData.candidates ?? []).slice(0, 3).map((candidate) => candidate.id));

    const youtube = accountsData.accounts?.find((account) => account.platform === "YOUTUBE");
    const defaultTemplate =
      templatesData.templates?.find((template) => template.isDefault && template.kind === "SHORTS_9_16") ??
      templatesData.templates?.find((template) => template.kind === "SHORTS_9_16") ??
      templatesData.templates?.find((template) => !template.kind) ??
      templatesData.templates?.[0];

    if (youtube) setAccountId((current) => current || youtube.id);
    if (defaultTemplate) setTemplateId((current) => current || defaultTemplate.id);
  }

  useEffect(() => {
    loadData().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Не получилось загрузить данные");
    });
  }, []);

  function setCandidatesAndDefaultSelection(nextCandidates: MovieCandidate[]) {
    setCandidates(nextCandidates);
    setSelectedCandidateIds(nextCandidates.slice(0, 3).map((candidate) => candidate.id));
  }

  async function addChannel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setChannelLoading(true);

    try {
      const response = await fetch("/api/factory/movie-moments/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: channelUrl.trim() }),
      });
      const data = (await response.json()) as {
        donors?: MovieDonor[];
        donor?: MovieDonor;
        candidates?: MovieCandidate[];
        message?: string;
        error?: string;
      };

      if (!response.ok) throw new Error(data.error ?? "Не получилось добавить канал");

      if (data.donor) {
        setDonors((current) => [data.donor!, ...current.filter((donor) => donor.id !== data.donor!.id)]);
      }
      if (data.candidates) setCandidatesAndDefaultSelection(data.candidates);
      setChannelUrl("");
      setMessage(data.message ?? "Канал сохранён и проанализирован.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не получилось добавить канал");
    } finally {
      setChannelLoading(false);
    }
  }

  async function refreshChannels() {
    setError("");
    setMessage("");
    setDailyLoading(true);

    try {
      const response = await fetch("/api/factory/movie-moments/channels/check", { method: "POST" });
      const data = (await response.json()) as { candidates?: MovieCandidate[]; summary?: { checked: number; errors: number }; error?: string };

      if (!response.ok) throw new Error(data.error ?? "Не получилось проверить каналы");

      if (data.candidates) setCandidatesAndDefaultSelection(data.candidates);
      setMessage(`Каналы проверены: ${data.summary?.checked ?? 0}. Ошибок: ${data.summary?.errors ?? 0}.`);
      await loadData();
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Не получилось проверить каналы");
    } finally {
      setDailyLoading(false);
    }
  }

  async function loadDailyPicks() {
    setError("");
    setMessage("");
    setDailyLoading(true);

    try {
      const response = await fetch("/api/factory/movie-moments/daily-picks", { cache: "no-store" });
      const data = (await response.json()) as { candidates?: MovieCandidate[]; error?: string };

      if (!response.ok) throw new Error(data.error ?? "Не получилось получить фильмы дня");

      setCandidatesAndDefaultSelection(data.candidates ?? []);
      setMessage("Подборка дня обновлена: выбраны 3 фильма для 9 роликов.");
    } catch (dailyError) {
      setError(dailyError instanceof Error ? dailyError.message : "Не получилось получить фильмы дня");
    } finally {
      setDailyLoading(false);
    }
  }

  async function createMovieMoments(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const formData = new FormData();
      if (sourceFile) formData.set("sourceFile", sourceFile);
      formData.set("movieTitle", movieTitle.trim());
      formData.set("description", description.trim());
      formData.set("clipCount", String(clipCount));
      formData.set("clipSeconds", String(clipSeconds));
      formData.set("accountId", accountId);
      formData.set("templateId", templateId);
      formData.set("scheduledAt", scheduledAt);

      const response = await fetch("/api/factory/movie-moments", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { job?: { id: string }; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось создать Movie Moments");
      }

      setMessage("Movie Moments создан. Worker выберет интересные сцены и сделает Shorts с Амелией.");
      setSourceFile(null);
      setMovieTitle("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не получилось создать Movie Moments");
    } finally {
      setLoading(false);
    }
  }

  async function createFromDailyPicks() {
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (selectedCandidateIds.length === 0) throw new Error("Выбери хотя бы один фильм");

      const response = await fetch("/api/factory/movie-moments/from-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceVideoIds: selectedCandidateIds.slice(0, 3),
          description: description.trim(),
          accountId,
          templateId,
          clipsPerMovie: youtubeClipsPerMovie,
          clipSeconds,
          scheduledAt,
        }),
      });
      const data = (await response.json()) as { jobs?: Array<{ id: string }>; message?: string; error?: string };

      if (!response.ok) throw new Error(data.error ?? "Не получилось создать Movie Moments из YouTube");

      setMessage(data.message ?? `Создано задач: ${data.jobs?.length ?? 0}`);
      await loadDailyPicks();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не получилось создать Movie Moments из YouTube");
    } finally {
      setLoading(false);
    }
  }

  function toggleCandidate(id: string) {
    setSelectedCandidateIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      return [...current, id].slice(0, 3);
    });
  }

  return (
    <main className="page">
      <div className="shell">
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
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card long-video-hero">
          <div>
            <span className="pill">MOVIE MOMENTS</span>
            <h1>Фильмы → Shorts с Амелией</h1>
            <p>
              Два режима: загрузить фильм файлом или сохранить официальные YouTube-каналы с фильмами. Каналы запоминаются,
              каждый день система даёт 3 фильма, а worker через RIP скачивает их и делает 9 роликов: по 3 момента с фильма.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <span className="pill">DAILY MOVIE SCOUT</span>
              <h2>Официальные каналы с фильмами</h2>
              <p className="muted">
                Вставляй ссылки на официальные YouTube-каналы. Система сохранит канал, проанализирует его uploads и будет
                выбирать фильмы дня. Видео скачиваются так же, как YouTube-исходники в Super Upload: через RIP, потом smart cut.
              </p>
            </div>
          </div>

          <form className="grid long-video-form" onSubmit={addChannel}>
            <label className="span-2">
              Ссылка на официальный канал / видео / @handle
              <input
                value={channelUrl}
                onChange={(event) => setChannelUrl(event.target.value)}
                placeholder="https://www.youtube.com/@officialmovieschannel"
                required
              />
              <small className="muted">Добавляй только каналы, где у тебя нормальный источник: official / licensed / public domain.</small>
            </label>
            <button className="primary-button span-2" type="submit" disabled={channelLoading}>
              {channelLoading ? "Сохраняю и анализирую..." : "Запомнить канал и найти фильмы"}
            </button>
          </form>

          <div className="grid grid-2" style={{ marginTop: 18 }}>
            <button className="secondary-button" type="button" onClick={refreshChannels} disabled={dailyLoading}>
              {dailyLoading ? "Проверяю каналы..." : "Проверить все каналы"}
            </button>
            <button className="secondary-button" type="button" onClick={loadDailyPicks} disabled={dailyLoading}>
              Подобрать 3 фильма на сегодня
            </button>
          </div>

          <div className="factory-table-wrap" style={{ marginTop: 18 }}>
            <table className="factory-table">
              <thead>
                <tr>
                  <th>Канал</th>
                  <th>Видео</th>
                  <th>Проверен</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {donors.length === 0 ? (
                  <tr><td colSpan={4}>Пока нет сохранённых movie-каналов.</td></tr>
                ) : donors.map((donor) => (
                  <tr key={donor.id}>
                    <td>{donor.channelTitle}</td>
                    <td>{formatNumber(donor.videoCount)}</td>
                    <td>{formatDate(donor.lastCheckedAt)}</td>
                    <td>{donor.isActive ? "Активен" : "Выключен"}{donor.lastError ? ` · ${donor.lastError}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <span className="pill">3 MOVIES → 9 SHORTS</span>
              <h2>Фильмы дня</h2>
              <p className="muted">
                Выбери до 3 фильмов. Worker создаст отдельную задачу на каждый фильм, скачает через RIP и сделает по 3 ролика
                или столько, сколько выберешь ниже.
              </p>
            </div>
          </div>

          <div className="grid grid-2">
            <label>
              YouTube-аккаунт
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
                <option value="">Выбери аккаунт</option>
                {youtubeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </label>

            <label>
              Amelia-шаблон
              <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} required>
                <option value="">Выбери шаблон</option>
                {shortsTemplates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
            </label>

            <label>
              Клипов с одного фильма
              <select value={youtubeClipsPerMovie} onChange={(event) => setYoutubeClipsPerMovie(Number(event.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((count) => (
                  <option key={count} value={count}>{count} клипа</option>
                ))}
              </select>
            </label>

            <label>
              Длина каждой вырезки
              <select value={clipSeconds} onChange={(event) => setClipSeconds(Number(event.target.value))}>
                {clipLengthOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label className="span-2">
              Запланировать старт, опционально
              <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
              <small className="muted">Если выбрать 3 фильма, второй и третий стартуют с интервалом примерно 45 минут.</small>
            </label>

            <label className="span-2">
              Описание для YouTube
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={"Movie: вставишь сам\n#movie #shorts #reaction"}
                rows={5}
                maxLength={5000}
              />
              <small className="muted">Title генерируется автоматически для каждого клипа. Description берётся отсюда.</small>
            </label>
          </div>

          <div className="grid" style={{ marginTop: 18 }}>
            {candidates.length === 0 ? (
              <div className="long-video-note">
                <b>Нет фильмов дня</b>
                <span>Добавь официальный канал или нажми “Проверить все каналы”.</span>
              </div>
            ) : candidates.map((candidate, index) => (
              <label key={candidate.id} className="long-video-note" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={selectedCandidateIds.includes(candidate.id)}
                  onChange={() => toggleCandidate(candidate.id)}
                />
                <b>{index + 1}. {candidate.title}</b>
                <span>
                  {candidate.channelTitle ?? "YouTube"} · {formatDuration(candidate.durationSeconds)} · views {formatNumber(candidate.views)} · score {candidate.viralChance}/100
                </span>
                {candidate.thumbnailUrl ? <img src={candidate.thumbnailUrl} alt="" style={{ width: 160, borderRadius: 12, marginTop: 10 }} /> : null}
              </label>
            ))}
          </div>

          <button className="primary-button" style={{ marginTop: 18 }} type="button" onClick={createFromDailyPicks} disabled={loading}>
            {loading ? "Создаю 9 роликов..." : `Создать из выбранных: ${selectedCandidateIds.length} фильмов / ${selectedCandidateIds.length * youtubeClipsPerMovie} роликов`}
          </button>
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <span className="pill">MANUAL UPLOAD</span>
              <h2>Или загрузи фильм файлом</h2>
              <p className="muted">Старый ручной режим остался: файл фильма → smart cut → Shorts с Амелией.</p>
            </div>
          </div>

          <form className="grid long-video-form" onSubmit={createMovieMoments}>
            <label>
              Файл фильма
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/x-matroska,video/webm,video/*"
                onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
              />
              <small className="muted">MP4/MOV/MKV/WEBM. Файл загружается тобой, система только режет его на моменты.</small>
            </label>

            <label>
              Название фильма
              <input
                value={movieTitle}
                onChange={(event) => setMovieTitle(event.target.value)}
                placeholder="Например: The Mask"
                maxLength={120}
              />
            </label>

            <div className="grid grid-2 span-2">
              <label>
                Сколько вырезок сделать
                <select value={clipCount} onChange={(event) => setClipCount(Number(event.target.value))}>
                  {clipCountOptions.map((count) => (
                    <option key={count} value={count}>{count} клипа</option>
                  ))}
                </select>
              </label>

              <label>
                Длина каждой вырезки
                <select value={clipSeconds} onChange={(event) => setClipSeconds(Number(event.target.value))}>
                  {clipLengthOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="long-video-note span-2">
              <b>Как это работает</b>
              <span>
                Worker анализирует фильм через smart cut: движение, звук, смены сцен и пики. Потом выбирает лучшие моменты,
                рендерит верх фильма + низ Амелии, генерирует уникальные title, а описание берет из твоего поля выше.
              </span>
            </div>

            <button className="primary-button span-2" type="submit" disabled={loading || !sourceFile || !movieTitle.trim()}>
              {loading ? "Создаю Movie Moments..." : "Создать Movie Moments из файла"}
            </button>
          </form>
        </section>

        {error ? <p className="factory-error-text">{error}</p> : null}
        {message ? <p className="factory-success-text">{message}</p> : null}
      </div>
    </main>
  );
}
