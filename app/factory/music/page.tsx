"use client";

import { useEffect, useMemo, useState } from "react";

type Track = {
  id: string;
  title: string;
  mood: string;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  isActive: boolean;
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
};

function formatBytes(value: number | null) {
  if (!value) return "—";
  if (value > 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(value / 1024)} KB`;
}

export default function FactoryMusicPage() {
  const [moods, setMoods] = useState<string[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [mood, setMood] = useState("suspense");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/factory/music", { cache: "no-store" });
    const data = await response.json();
    setMoods(data.moods ?? []);
    setTracks(data.tracks ?? []);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "Ошибка"));
  }, []);

  const grouped = useMemo(() => {
    return moods.map((item) => ({
      mood: item,
      tracks: tracks.filter((track) => track.mood === item),
    }));
  }, [moods, tracks]);

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

      const response = await fetch("/api/factory/music", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error ?? "Ошибка загрузки");

      setTitle("");
      setFile(null);
      setMessage("Трек загружен");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function toggle(track: Track) {
    await fetch("/api/factory/music", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: track.id, isActive: !track.isActive }),
    });
    await load();
  }

  async function remove(track: Track) {
    if (!confirm(`Удалить трек ${track.title}?`)) return;
    await fetch(`/api/factory/music?id=${track.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <main className="factory-shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/super-upload">СУПЕР ЗАЛИВ</Link>
          <Link href="/factory/story-shorts">Story Shorts</Link>
          <Link href="/factory/music">Музыка</Link>
          <Link href="/factory/long-video">Видео 16:9</Link>
          <Link href="/factory/analytics">Аналитика</Link>
          <Link href="/factory/assets">Видео персонажей</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/thumbnails">Превью</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

      <section className="factory-panel factory-panel-wide">
        <div className="factory-eyebrow">MUSIC LIBRARY</div>
        <h1>Музыка по темам</h1>
        <p className="factory-muted">
          Загружай по 10–15 треков в каждую тему. Roblox Story Shorts сам выберет настроение и возьмет активный трек из нужной папки R2.
        </p>

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
        </div>

        <button className="factory-primary-button" disabled={loading} onClick={upload}>
          {loading ? "Загружаю..." : "Загрузить трек"}
        </button>
        {message ? <p className="factory-error-text">{message}</p> : null}
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
                    </div>
                    <div className="factory-row-actions">
                      <button onClick={() => toggle(track)}>{track.isActive ? "Выкл" : "Вкл"}</button>
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
