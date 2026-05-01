"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FactoryAsset = {
  id: string;
  title: string;
  originalName: string | null;
  sizeBytes: number | null;
  storageKey: string | null;
  createdAt: string;
};

export default function FactoryAssetsPage() {
  const [assets, setAssets] = useState<FactoryAsset[]>([]);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
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

    if (!file) {
      setError("Выбери видеофайл");
      return;
    }

    setIsUploading(true);
    setError("");

    try {
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
        throw new Error(data.error ?? "Не получилось загрузить файл");
      }

      setTitle("");
      setFile(null);
      await loadAssets();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Не получилось загрузить файл",
      );
    } finally {
      setIsUploading(false);
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
          <h1>Видео Ланы</h1>
          <p>
            Сюда загружаешь видео, где Лана сидит и смотрит. Файл сохраняется
            локально и в Cloudflare R2.
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
              MP4 файл
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>

            {error ? <p className="error">{error}</p> : null}

            <button disabled={isUploading}>
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
              </tr>
            </thead>

            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td>{asset.title}</td>
                  <td>{asset.originalName}</td>
                  <td>
                    {asset.sizeBytes
                      ? `${(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                      : "—"}
                  </td>
                  <td>
                    {asset.storageKey ? (
                      <span className="success">загружено</span>
                    ) : (
                      <span className="muted">локально</span>
                    )}
                  </td>
                </tr>
              ))}

              {assets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    Пока ничего не загружено.
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
