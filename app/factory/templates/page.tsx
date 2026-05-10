"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FactoryAsset = {
  id: string;
  title: string;
  originalName: string | null;
};

type FactoryTemplate = {
  id: string;
  name: string;
  isDefault: boolean;
  mirrorLana: boolean;
  asset: FactoryAsset | null;
};

export default function FactoryTemplatesPage() {
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [assets, setAssets] = useState<FactoryAsset[]>([]);
  const [name, setName] = useState("Ember watch");
  const [assetId, setAssetId] = useState("");
  const [mirrorLana, setMirrorLana] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [error, setError] = useState("");

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === assetId) ?? null,
    [assets, assetId],
  );

  async function loadTemplates() {
    const response = await fetch("/api/factory/templates", {
      cache: "no-store",
    });

    const data = (await response.json()) as {
      templates: FactoryTemplate[];
    };

    setTemplates(data.templates);
  }

  async function loadAssets() {
    const response = await fetch("/api/factory/assets", {
      cache: "no-store",
    });

    const data = (await response.json()) as {
      assets: FactoryAsset[];
    };

    setAssets(data.assets);

    if (!assetId && data.assets[0]) {
      setAssetId(data.assets[0].id);
    }
  }

  useEffect(() => {
    loadTemplates();
    loadAssets();
  }, []);

  async function saveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    try {
      if (!assetId) {
        throw new Error("Выбери видео персонажа для этого шаблона");
      }

      const response = await fetch("/api/factory/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          assetId,
          lanaX: 0,
          lanaY: 50,
          lanaWidth: 1080,
          lanaHeight: 960,
          mirrorLana,
          isDefault,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось сохранить шаблон");
      }

      await loadTemplates();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не получилось сохранить шаблон",
      );
    }
  }

  async function makeDefault(id: string) {
    await fetch(`/api/factory/templates/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        isDefault: true,
      }),
    });

    await loadTemplates();
  }

  async function removeTemplate(id: string) {
    const confirmed = window.confirm(
      "Удалить шаблон? Если он был выбран в задачах, старые задачи останутся в истории.",
    );

    if (!confirmed) return;

    await fetch(`/api/factory/templates/${id}`, {
      method: "DELETE",
    });

    await loadTemplates();
  }

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/super-upload">СУПЕР ЗАЛИВ</Link>
          <Link href="/factory/assets">Видео персонажей</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>Шаблоны персонажей</h1>
          <p>
            Новый шаблон — это только видео персонажа и зеркальность. Рендер всегда
            делит экран 9:16 ровно пополам: сверху игра, снизу персонаж по центру
            с сохранением пропорций.
          </p>

          <div className="template-editor split-template-editor">
            <form className="grid" onSubmit={saveTemplate}>
              <label>
                Название шаблона
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Lana watch / Ember watch / Mia watch"
                  required
                />
              </label>

              <label>
                Видео персонажа для этого шаблона
                <select
                  value={assetId}
                  onChange={(event) => setAssetId(event.target.value)}
                  required
                >
                  {assets.length === 0 ? (
                    <option value="">Сначала загрузи видео персонажа</option>
                  ) : null}

                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.title}
                      {asset.originalName ? ` — ${asset.originalName}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-2">
                <label>
                  Отзеркалить персонажа
                  <select
                    value={mirrorLana ? "yes" : "no"}
                    onChange={(event) =>
                      setMirrorLana(event.target.value === "yes")
                    }
                  >
                    <option value="no">Нет</option>
                    <option value="yes">Да</option>
                  </select>
                </label>

                <label>
                  Использовать по умолчанию
                  <select
                    value={isDefault ? "yes" : "no"}
                    onChange={(event) => setIsDefault(event.target.value === "yes")}
                  >
                    <option value="yes">Да</option>
                    <option value="no">Нет</option>
                  </select>
                </label>
              </div>

              <div className="split-template-note">
                <b>Как будет выглядеть рендер:</b>
                <span>Верхние 50% — игровое видео, crop по центру.</span>
                <span>Нижние 50% — видео персонажа, crop по центру.</span>
                <span>Позиции X/Y больше не нужны и не используются.</span>
              </div>

              {error ? <p className="error">{error}</p> : null}

              <button type="submit">Сохранить шаблон</button>
            </form>

            <div className="split-template-preview">
              <div className="split-preview-half split-preview-game">
                <span>GAME VIDEO</span>
              </div>
              <div className={`split-preview-half split-preview-person ${mirrorLana ? "mirror" : ""}`}>
                <span>{selectedAsset?.title ?? "PERSON VIDEO"}</span>
              </div>
            </div>
          </div>
        </section>

        <section style={{ height: 24 }} />

        <section className="card">
          <h2>Сохраненные шаблоны</h2>

          <table className="table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Видео персонажа</th>
                <th>Формат</th>
                <th>Зеркало</th>
                <th>Действия</th>
              </tr>
            </thead>

            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td>
                    {template.name}{" "}
                    {template.isDefault ? (
                      <span className="badge">default</span>
                    ) : null}
                  </td>
                  <td>
                    {template.asset ? (
                      <>
                        <b>{template.asset.title}</b>
                        {template.asset.originalName ? (
                          <p className="muted">{template.asset.originalName}</p>
                        ) : null}
                      </>
                    ) : (
                      <span className="error">Видео не выбрано</span>
                    )}
                  </td>
                  <td>50/50: игра сверху, персонаж снизу</td>
                  <td>{template.mirrorLana ? "Да" : "Нет"}</td>
                  <td>
                    <div className="inline-actions">
                      <button type="button" onClick={() => makeDefault(template.id)}>
                        Сделать основным
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => removeTemplate(template.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {templates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    Пока шаблонов нет.
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
