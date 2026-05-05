"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FactoryGame =
  | "ROBLOX"
  | "FORTNITE"
  | "MINECRAFT"
  | "BRAWL_STARS"
  | "DOTA2"
  | "OTHER";

type FactoryThumbnail = {
  id: string;
  title: string;
  game: FactoryGame;
  filePath: string;
  storageKey: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const gameOptions: Array<{
  value: FactoryGame;
  label: string;
}> = [
  { value: "ROBLOX", label: "Roblox" },
  { value: "FORTNITE", label: "Fortnite" },
  { value: "MINECRAFT", label: "Minecraft" },
  { value: "BRAWL_STARS", label: "Brawl Stars" },
  { value: "DOTA2", label: "Dota 2" },
  { value: "OTHER", label: "Other" },
];

function formatMb(bytes: number | null) {
  if (!bytes) return "—";

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getGameLabel(game: FactoryGame) {
  return gameOptions.find((option) => option.value === game)?.label ?? game;
}

export default function FactoryThumbnailsPage() {
  const [thumbnails, setThumbnails] = useState<FactoryThumbnail[]>([]);
  const [title, setTitle] = useState("");
  const [game, setGame] = useState<FactoryGame>("ROBLOX");
  const [file, setFile] = useState<File | null>(null);
  const [filterGame, setFilterGame] = useState<FactoryGame | "ALL">("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [togglingId, setTogglingId] = useState("");
  const [error, setError] = useState("");

  const filteredThumbnails = useMemo(() => {
    if (filterGame === "ALL") {
      return thumbnails;
    }

    return thumbnails.filter((thumbnail) => thumbnail.game === filterGame);
  }, [filterGame, thumbnails]);

  async function loadThumbnails() {
    try {
      setError("");

      const response = await fetch("/api/factory/thumbnails", {
        cache: "no-store",
      });

      const data = (await response.json()) as {
        thumbnails?: FactoryThumbnail[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось загрузить превью");
      }

      setThumbnails(data.thumbnails ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не получилось загрузить превью",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadThumbnails();
  }, []);

  async function uploadThumbnail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("Выбери JPG, PNG или WEBP картинку");
      return;
    }

    setIsUploading(true);
    setError("");

    try {
      const formData = new FormData();

      formData.set("title", title.trim() || file.name);
      formData.set("game", game);
      formData.set("file", file);

      const response = await fetch("/api/factory/thumbnails", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as {
        thumbnail?: FactoryThumbnail;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось загрузить превью");
      }

      setTitle("");
      setFile(null);

      const fileInput = document.getElementById(
        "factory-thumbnail-file",
      ) as HTMLInputElement | null;

      if (fileInput) {
        fileInput.value = "";
      }

      await loadThumbnails();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Не получилось загрузить превью",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function toggleThumbnail(thumbnail: FactoryThumbnail) {
    setTogglingId(thumbnail.id);
    setError("");

    try {
      const response = await fetch(`/api/factory/thumbnails/${thumbnail.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isActive: !thumbnail.isActive,
        }),
      });

      const data = (await response.json()) as {
        thumbnail?: FactoryThumbnail;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось обновить превью");
      }

      await loadThumbnails();
    } catch (toggleError) {
      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Не получилось обновить превью",
      );
    } finally {
      setTogglingId("");
    }
  }

  async function deleteThumbnail(thumbnailId: string) {
    const confirmed = window.confirm("Удалить это превью?");

    if (!confirmed) {
      return;
    }

    setDeletingId(thumbnailId);
    setError("");

    try {
      const response = await fetch(`/api/factory/thumbnails/${thumbnailId}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось удалить превью");
      }

      await loadThumbnails();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не получилось удалить превью",
      );
    } finally {
      setDeletingId("");
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/assets">Видео персонажей</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/thumbnails">Превью</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>Превью для Shorts</h1>
          <p>
            Загружай разные вертикальные картинки 9:16. Завод будет брать
            случайное активное превью под выбранную игру и вставлять его в самое
            начало ролика на 0.09–0.12 секунды. Для глаза почти незаметно, но
            сетка канала будет выглядеть разнообразнее.
          </p>

          <form className="thumbnail-upload-form" onSubmit={uploadThumbnail}>
            <div className="grid grid-2">
              <label>
                Название превью
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Roblox bright hook 01"
                />
              </label>

              <label>
                Игра
                <select
                  value={game}
                  onChange={(event) => setGame(event.target.value as FactoryGame)}
                >
                  {gameOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Картинка превью
              <input
                id="factory-thumbnail-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <div className="thumbnail-rules">
              <span className="badge">Лучший формат: 1080×1920</span>
              <span className="badge">JPG / PNG / WEBP</span>
              <span className="badge">Без мелкого текста</span>
              <span className="badge">Яркий первый кадр</span>
            </div>

            {error ? <p className="error">{error}</p> : null}

            <button disabled={isUploading}>
              {isUploading ? "Загружаю..." : "Загрузить превью"}
            </button>
          </form>
        </section>

        <section style={{ height: 24 }} />

        <section className="card">
          <div className="thumbnail-list-head">
            <div>
              <h2>Библиотека превью</h2>
              <p className="muted">
                Активные превью участвуют в рандомной подстановке. Если для
                игры нет активных превью, worker попробует взять превью из
                категории Other.
              </p>
            </div>

            <label className="thumbnail-filter">
              Фильтр
              <select
                value={filterGame}
                onChange={(event) =>
                  setFilterGame(event.target.value as FactoryGame | "ALL")
                }
              >
                <option value="ALL">Все игры</option>
                {gameOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isLoading ? <p className="muted">Загружаю превью...</p> : null}

          {!isLoading && filteredThumbnails.length === 0 ? (
            <p className="muted">
              Пока превью нет. Загрузи хотя бы несколько картинок под Roblox /
              Fortnite / Minecraft.
            </p>
          ) : null}

          <div className="thumbnail-grid">
            {filteredThumbnails.map((thumbnail) => (
              <article
                className={`thumbnail-card ${
                  thumbnail.isActive ? "" : "inactive"
                }`}
                key={thumbnail.id}
              >
                <div className="thumbnail-preview">
                  <div className="thumbnail-preview-placeholder">
                    <span>{getGameLabel(thumbnail.game)}</span>
                    <small>R2 / local preview</small>
                  </div>
                </div>

                <div className="thumbnail-card-body">
                  <div className="thumbnail-title-row">
                    <h3>{thumbnail.title}</h3>
                    <span
                      className={`badge ${
                        thumbnail.isActive ? "success-badge" : "muted-badge"
                      }`}
                    >
                      {thumbnail.isActive ? "active" : "off"}
                    </span>
                  </div>

                  <p className="muted">
                    {getGameLabel(thumbnail.game)} · {formatMb(thumbnail.sizeBytes)}
                  </p>

                  <p className="muted">
                    {thumbnail.originalName ?? "image"} ·{" "}
                    {formatDateTime(thumbnail.createdAt)}
                  </p>

                  <p className="muted thumbnail-storage-key">
                    {thumbnail.storageKey ?? "local only"}
                  </p>

                  <div className="inline-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={togglingId === thumbnail.id}
                      onClick={() => toggleThumbnail(thumbnail)}
                    >
                      {thumbnail.isActive ? "Выключить" : "Включить"}
                    </button>

                    <button
                      type="button"
                      className="danger-button"
                      disabled={deletingId === thumbnail.id}
                      onClick={() => deleteThumbnail(thumbnail.id)}
                    >
                      {deletingId === thumbnail.id ? "Удаляю..." : "Удалить"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
