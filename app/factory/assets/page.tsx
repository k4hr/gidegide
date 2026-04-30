"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FactoryAsset = {
  id: string;
  type: "HOOK" | "LANA";
  title: string;
  originalName: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

export default function FactoryAssetsPage() {
  const [assets, setAssets] = useState<FactoryAsset[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"HOOK" | "LANA">("HOOK");
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
      formData.set("type", type);
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
          <Link href="/factory/assets">Хуки и Лана</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>Хуки и видео Ланы</h1>
          <p>
            Сюда загружаешь короткие хуки и видео, где Лана просто сидит и
            смотрит телефон. Worker будет рандомно брать их для каждого клипа.
          </p>

          <form className="grid" onSubmit={uploadAsset}>
            <div className="grid grid-2">
              <label>
                Тип
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as "HOOK" | "LANA")}
                >
                  <option value="HOOK">HOOK — хук в начале</option>
                  <option value="LANA">LANA — Лана смотрит телефон</option>
                </select>
              </label>

              <label>
                Название
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="hook 001 / lana watch 001"
                  required
                />
              </label>
            </div>

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
          <h2>Загруженные ассеты</h2>

          <table className="table">
            <thead>
              <tr>
                <th>Тип</th>
                <th>Название</th>
                <th>Файл</th>
                <th>Размер</th>
              </tr>
            </thead>

            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id}>
                  <td><span className="badge">{asset.type}</span></td>
                  <td>{asset.title}</td>
                  <td>{asset.originalName}</td>
                  <td>
                    {asset.sizeBytes
                      ? `${(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                      : "—"}
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
