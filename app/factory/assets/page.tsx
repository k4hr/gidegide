"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FactoryAsset = {
  id: string;
  title: string;
  filePath: string;
  storageKey: string | null;
  originalName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

function formatMb(bytes: number | null) {
  if (!bytes) {
    return "—";
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FactoryAssetsPage() {
  const [assets, setAssets] = useState<FactoryAsset[]>([]);
  const [title, setTitle] = useState("lana watch 001");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  async function loadAssets() {
    const response = await fetch("/api/factory/assets", {
      cache: "no-store",
    });

    const data = (await response.json()) as {
      assets: FactoryAsset[];
    };

    setAssets(data.assets);
  }

  useEffect(() => {
    loadAssets();
  }, []);

  async function uploadAsset(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setIsUploading(true);

    try {
      if (!file) {
        throw new Error("Выбери MP4/MOV файл");
      }

      const formData = new FormData();

      formData.set("title", title);
      formData.set("file", file);

      const response = await fetch("/api/factory/assets", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось загрузить видео");
      }

      setFile(null);
      await loadAssets();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Не получилось загрузить видео",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function deleteAsset(asset: FactoryAsset) {
    const confirmed = window.confirm(
      `Удалить видео "${asset.title}"?\n\nЕсли оно было привязано к шаблону, шаблон останется, но видео в нем нужно будет выбрать заново.`,
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setDeletingId(asset.id);

    try {
      const response = await fetch(`/api/factory/assets/${asset.id}`, {
        method: "DELETE",
      });

      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось удалить видео");
      }

      await loadAssets();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не получилось удалить видео",
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
          <Link href="/factory/super-upload">СУПЕР ЗАЛИВ</Link>
          <Link href="/factory/story-shorts">Story Shorts</Link>
          <Link href="/factory/music">Музыка</Link>
          <Link href="/factory/long-video">Видео 16:9</Link>
          <Link href="/factory/assets">Видео персонажей</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>Видео персонажей</h1>
          <p>
            Сюда загружаешь видео, где персонаж сидит и смотрит. Потом это
            видео привязывается к конкретному шаблону: Lana, Mia, Amelia.
          </p>

          <form className="grid" onSubmit={uploadAsset}>
            <label>
              Название
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="lana watch 001"
                required
              />
            </label>

            <label>
              MP4/MOV файл
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>

            {error ? <p className="error">{error}</p> : null}

            <button type="submit" disabled={isUploading}>
              {isUploading ? "Загружаю..." : "Загрузить"}
            </button>
          </form>
        </section>

        <section style={{ height: 24 }} />

        <section className="card">
          <h2>Загруженные видео</h2>

          <table className="table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Файл</th>
                <th>Размер</th>
                <th>R2</th>
                <th>Действия</th>
              </tr>
            </thead>

            <tbody>
              {assets.map((asset) => {
                const isDeleting = deletingId === asset.id;

                return (
                  <tr key={asset.id}>
                    <td>
                      <b>{asset.title}</b>
                    </td>

                    <td>{asset.originalName ?? "—"}</td>

                    <td>{formatMb(asset.sizeBytes)}</td>

                    <td>
                      {asset.storageKey ? (
                        <span className="success">загружено</span>
                      ) : (
                        <span className="muted">локально</span>
                      )}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="danger-button"
                        disabled={isDeleting}
                        onClick={() => deleteAsset(asset)}
                      >
                        {isDeleting ? "Удаляю..." : "Удалить"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {assets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Пока видео нет.
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
