"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Track = {
  id: string;
  title: string;
  mood: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  isActive: boolean;
  copyrightStatus: string;
  musicSource: string;
  licenseType: string;
  artist: string | null;
  sourceUrl: string | null;
  needsAttribution: boolean;
  attributionText: string | null;
  riskScore: number;
  blockedReason: string | null;
  confirmedSafeAt: string | null;
  lastClaimAt: string | null;
  createdAt: string;
};

const moodLabels: Record<string, string> = {
  sad: "Sad / грусть",
  emotional: "Emotional / слезы",
  suspense: "Suspense / напряжение",
  horror: "Horror / страшно",
  scary: "Scary / тревога",
  funny: "Funny / смешно",
  chaos: "Chaos / хаос",
  epic: "Epic / эпик",
  victory: "Victory / победа",
  fail: "Fail / фейл",
  cute: "Cute / милота",
  magical: "Magical / подарок",
  gift: "Gift / сюрприз",
  choice: "Choice / выбор",
  rich: "Rich / богатство",
  poor: "Poor / бедность",
  love: "Love / любовь",
  bullying: "Bullying / буллинг",
  revenge: "Revenge / месть",
  system: "System / система",
  mystery: "Mystery / загадка",
  surprise: "Surprise / шок",
  dramatic: "Dramatic / драма",
  chase: "Chase / погоня",
  chill: "Chill / спокойно",
  explaining: "Explaining / объяснение",
  finale: "Finale / финал",
  happy: "Happy / радость",
  hype: "Hype / драйв",
  intense: "Intense / интенсивно",
  other: "Other / другое",
  random: "Random / случайное",
  riser: "Riser / нарастание",
  sneaky: "Sneaky / скрытно",
};

const copyrightLabels: Record<string, string> = {
  SAFE_YOUTUBE_AUDIO_LIBRARY: "SAFE · YouTube Audio Library",
  SAFE_OWNED: "SAFE · свой трек",
  SAFE_ROYALTY_FREE: "SAFE · royalty-free",
  UNKNOWN: "UNKNOWN · не использовать автоматически",
  RISKY: "RISKY · риск АП",
  BLOCKED: "BLOCKED · был АП / запрет",
};

const sourceLabels: Record<string, string> = {
  YOUTUBE_AUDIO_LIBRARY: "YouTube Audio Library",
  OWNED: "Свой трек",
  ROYALTY_FREE: "Royalty-free",
  OTHER: "Другое",
  UNKNOWN: "Неизвестно",
};

const licenseLabels: Record<string, string> = {
  ATTRIBUTION_NOT_REQUIRED: "Attribution not required",
  ATTRIBUTION_REQUIRED: "Attribution required",
  OWNED: "Owned",
  UNKNOWN: "Unknown",
};

function formatBytes(value: number | null) {
  if (!value) return "—";
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

function statusClass(status: string) {
  if (status.startsWith("SAFE_")) return "factory-status-ok";
  if (status === "BLOCKED" || status === "RISKY") return "factory-status-danger";
  return "factory-status-warn";
}

export default function FactoryMusicPage() {
  const [moods, setMoods] = useState<string[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [mood, setMood] = useState("suspense");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [musicSource, setMusicSource] = useState("YOUTUBE_AUDIO_LIBRARY");
  const [licenseType, setLicenseType] = useState("ATTRIBUTION_NOT_REQUIRED");
  const [copyrightStatus, setCopyrightStatus] = useState("SAFE_YOUTUBE_AUDIO_LIBRARY");
  const [artist, setArtist] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [needsAttribution, setNeedsAttribution] = useState(false);
  const [attributionText, setAttributionText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncPrefix, setSyncPrefix] = useState("factory/music-library/");
  const [syncSource, setSyncSource] = useState("YOUTUBE_AUDIO_LIBRARY");
  const [syncLicense, setSyncLicense] = useState("ATTRIBUTION_NOT_REQUIRED");
  const [syncStatus, setSyncStatus] = useState("SAFE_YOUTUBE_AUDIO_LIBRARY");
  const [syncNeedsAttribution, setSyncNeedsAttribution] = useState(false);
  const [syncAttributionText, setSyncAttributionText] = useState("");
  const [syncResult, setSyncResult] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/factory/music", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error ?? "Не удалось загрузить музыку");
    }

    setMoods(data.moods ?? []);
    setTracks(data.tracks ?? []);
  }

  useEffect(() => {
    load().catch((error) =>
      setMessage(error instanceof Error ? error.message : "Ошибка"),
    );
  }, []);

  const grouped = useMemo(() => {
    return moods.map((item) => ({
      mood: item,
      tracks: tracks.filter((track) => track.mood === item),
    }));
  }, [moods, tracks]);

  const totals = useMemo(() => {
    return tracks.reduce(
      (acc, track) => {
        acc.total += 1;
        if (track.copyrightStatus.startsWith("SAFE_") && track.isActive) acc.safe += 1;
        if (track.copyrightStatus === "UNKNOWN") acc.unknown += 1;
        if (track.copyrightStatus === "RISKY") acc.risky += 1;
        if (track.copyrightStatus === "BLOCKED") acc.blocked += 1;
        return acc;
      },
      { total: 0, safe: 0, unknown: 0, risky: 0, blocked: 0 },
    );
  }, [tracks]);

  async function upload() {
    if (!file) {
      setMessage("Выбери аудио-файл");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.set("mood", mood);
      formData.set("title", title);
      formData.set("file", file);
      formData.set("musicSource", musicSource);
      formData.set("licenseType", licenseType);
      formData.set("copyrightStatus", copyrightStatus);
      formData.set("artist", artist);
      formData.set("sourceUrl", sourceUrl);
      formData.set("needsAttribution", String(needsAttribution));
      formData.set("attributionText", attributionText);

      const response = await fetch("/api/factory/music", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Ошибка загрузки");
      }

      setTitle("");
      setFile(null);
      setArtist("");
      setSourceUrl("");
      setAttributionText("");
      setMessage("Трек загружен");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function syncR2Library() {
    setSyncing(true);
    setMessage(null);
    setSyncResult(null);

    try {
      const response = await fetch("/api/factory/music/sync-r2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prefix: syncPrefix,
          musicSource: syncSource,
          licenseType: syncLicense,
          copyrightStatus: syncStatus,
          needsAttribution: syncNeedsAttribution,
          attributionText: syncAttributionText || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Ошибка синхронизации R2");
      }

      setSyncResult(
        `R2 sync: найдено ${data.found}, добавлено ${data.created}, обновлено ${data.updated ?? 0}, пропущено ${data.skipped}, ошибок ${data.errors?.length ?? 0}`,
      );
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка синхронизации R2");
    } finally {
      setSyncing(false);
    }
  }

  async function updateTrack(track: Track, patch: Record<string, unknown>) {
    setMessage(null);

    try {
      const response = await fetch("/api/factory/music", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: track.id, ...patch }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Ошибка обновления трека");
      }

      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка обновления");
    }
  }

  async function toggle(track: Track) {
    await updateTrack(track, { isActive: !track.isActive });
  }

  async function markSafe(track: Track) {
    await updateTrack(track, {
      isActive: true,
      copyrightStatus: "SAFE_YOUTUBE_AUDIO_LIBRARY",
      musicSource: "YOUTUBE_AUDIO_LIBRARY",
      licenseType: "ATTRIBUTION_NOT_REQUIRED",
      needsAttribution: false,
      blockedReason: null,
    });
  }

  async function markUnknown(track: Track) {
    await updateTrack(track, {
      copyrightStatus: "UNKNOWN",
      musicSource: "UNKNOWN",
      licenseType: "UNKNOWN",
      riskScore: 50,
    });
  }

  async function blockTrack(track: Track) {
    const reason = prompt("Почему блокируем трек? Например: Content ID / АП / claim") ?? "Content ID / АП";
    await updateTrack(track, {
      isActive: false,
      copyrightStatus: "BLOCKED",
      blockedReason: reason,
    });
  }

  async function remove(track: Track) {
    if (!confirm(`Удалить трек ${track.title}?`)) return;

    setMessage(null);

    try {
      const response = await fetch(`/api/factory/music?id=${track.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Ошибка удаления трека");
      }

      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка удаления");
    }
  }

  return (
    <main className="factory-shell">
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

      <section className="factory-panel factory-panel-wide">
        <div className="factory-eyebrow">MUSIC SAFETY</div>
        <h1>Музыка по темам</h1>
        <p className="factory-muted">
          YouTube Content ID нельзя проверить заранее на 100%, поэтому завод использует автоматически только треки со статусом SAFE. Unknown/Risky/Blocked не попадут в Story Shorts.
        </p>
        <div className="factory-grid-cards">
          <div className="factory-stat-card"><strong>{totals.total}</strong><span>всего треков</span></div>
          <div className="factory-stat-card"><strong>{totals.safe}</strong><span>SAFE активных</span></div>
          <div className="factory-stat-card"><strong>{totals.unknown}</strong><span>UNKNOWN</span></div>
          <div className="factory-stat-card"><strong>{totals.risky + totals.blocked}</strong><span>RISKY/BLOCKED</span></div>
        </div>
      </section>

      <section className="factory-panel factory-panel-wide">
        <div className="factory-eyebrow">UPLOAD</div>
        <h2>Загрузить трек вручную</h2>
        <div className="factory-form-grid">
          <label>
            Тема
            <select value={mood} onChange={(event) => setMood(event.target.value)}>
              {moods.map((item) => (
                <option key={item} value={item}>{moodLabels[item] ?? item}</option>
              ))}
            </select>
          </label>
          <label>
            Название
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например: sad piano drop 01" />
          </label>
          <label>
            Файл
            <input type="file" accept="audio/*,video/mp4" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <label>
            Источник
            <select value={musicSource} onChange={(event) => setMusicSource(event.target.value)}>
              {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Лицензия
            <select value={licenseType} onChange={(event) => setLicenseType(event.target.value)}>
              {Object.entries(licenseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Copyright status
            <select value={copyrightStatus} onChange={(event) => setCopyrightStatus(event.target.value)}>
              {Object.entries(copyrightLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Artist
            <input value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="Автор, если нужно" />
          </label>
          <label>
            Source URL
            <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Ссылка на источник/лицензию" />
          </label>
        </div>
        <label className="factory-checkbox-row">
          <input type="checkbox" checked={needsAttribution} onChange={(event) => setNeedsAttribution(event.target.checked)} />
          Attribution required / нужно указывать автора
        </label>
        <label>
          Attribution text
          <textarea value={attributionText} onChange={(event) => setAttributionText(event.target.value)} placeholder="Текст атрибуции, если требуется" />
        </label>
        <button className="factory-primary-button" disabled={loading} onClick={upload}>
          {loading ? "Загружаю..." : "Загрузить трек"}
        </button>
        {message ? <p className="factory-error-text">{message}</p> : null}
      </section>

      <section className="factory-panel factory-panel-wide">
        <div className="factory-eyebrow">R2 SYNC</div>
        <h2>Синхронизация большой библиотеки из Cloudflare</h2>
        <p className="factory-muted">
          Если папка скачана из YouTube Audio Library с фильтром Attribution not required, оставляй SAFE. Если источник сомнительный — ставь UNKNOWN, и worker не будет использовать эти треки автоматически.
        </p>
        <div className="factory-form-grid">
          <label>
            R2 prefix
            <input value={syncPrefix} onChange={(event) => setSyncPrefix(event.target.value)} placeholder="factory/music-library/" />
          </label>
          <label>
            Источник
            <select value={syncSource} onChange={(event) => setSyncSource(event.target.value)}>
              {Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Лицензия
            <select value={syncLicense} onChange={(event) => setSyncLicense(event.target.value)}>
              {Object.entries(licenseLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Copyright status
            <select value={syncStatus} onChange={(event) => setSyncStatus(event.target.value)}>
              {Object.entries(copyrightLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <label className="factory-checkbox-row">
          <input type="checkbox" checked={syncNeedsAttribution} onChange={(event) => setSyncNeedsAttribution(event.target.checked)} />
          Attribution required для всей импортируемой папки
        </label>
        <label>
          Attribution text для sync
          <textarea value={syncAttributionText} onChange={(event) => setSyncAttributionText(event.target.value)} placeholder="Если требуется атрибуция — общий текст" />
        </label>
        <button className="factory-primary-button" disabled={syncing} onClick={syncR2Library}>
          {syncing ? "Синхронизирую..." : "Синхронизировать R2-библиотеку"}
        </button>
        {syncResult ? <p className="factory-success-text">{syncResult}</p> : null}
      </section>

      <section className="factory-panel factory-panel-wide">
        <h2>Темы и треки</h2>
        <div className="factory-grid-cards">
          {grouped.map((group) => (
            <div className="factory-card" key={group.mood}>
              <h3>{moodLabels[group.mood] ?? group.mood}</h3>
              <p className="factory-muted">{group.tracks.length} треков</p>
              <div className="factory-stack">
                {group.tracks.length === 0 ? <span className="factory-muted">Пока пусто</span> : null}
                {group.tracks.map((track) => (
                  <div className="factory-mini-row" key={track.id}>
                    <div>
                      <strong>{track.title}</strong>
                      <span>{formatBytes(track.sizeBytes)} · {track.isActive ? "активен" : "выключен"}</span>
                      <span className={statusClass(track.copyrightStatus)}>{copyrightLabels[track.copyrightStatus] ?? track.copyrightStatus} · risk {track.riskScore}/100</span>
                      <span>{sourceLabels[track.musicSource] ?? track.musicSource} · {licenseLabels[track.licenseType] ?? track.licenseType}</span>
                      {track.blockedReason ? <span>Причина: {track.blockedReason}</span> : null}
                    </div>
                    <div className="factory-row-actions">
                      <button onClick={() => toggle(track)}>{track.isActive ? "Выкл" : "Вкл"}</button>
                      <button onClick={() => markSafe(track)}>SAFE</button>
                      <button onClick={() => markUnknown(track)}>UNKNOWN</button>
                      <button onClick={() => blockTrack(track)}>АП / BLOCK</button>
                      <button onClick={() => remove(track)}>Удалить</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
