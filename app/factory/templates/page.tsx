"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FactoryAsset = {
  id: string;
  title: string;
  originalName: string | null;
  storageKey: string | null;
};

type FactoryTemplate = {
  id: string;
  name: string;
  isDefault: boolean;
  assetId: string | null;
  asset: FactoryAsset | null;
  lanaX: number;
  lanaY: number;
  lanaWidth: number;
  lanaHeight: number;
  mirrorLana: boolean;
};

type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

function cornerToPosition(corner: Corner) {
  if (corner === "top-left") return { lanaX: 4, lanaY: 4 };
  if (corner === "top-right") return { lanaX: 78, lanaY: 4 };
  if (corner === "bottom-left") return { lanaX: 4, lanaY: 68 };

  return { lanaX: 78, lanaY: 68 };
}

export default function FactoryTemplatesPage() {
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [assets, setAssets] = useState<FactoryAsset[]>([]);
  const [name, setName] = useState("Lana Template");
  const [assetId, setAssetId] = useState("");
  const [lanaX, setLanaX] = useState(78);
  const [lanaY, setLanaY] = useState(68);
  const [lanaWidth, setLanaWidth] = useState(300);
  const [lanaHeight, setLanaHeight] = useState(533);
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

  function setCorner(corner: Corner) {
    const position = cornerToPosition(corner);

    setLanaX(position.lanaX);
    setLanaY(position.lanaY);
  }

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
          lanaX,
          lanaY,
          lanaWidth,
          lanaHeight,
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
          <Link href="/factory/super-upload">Супер залив</Link>
          <Link href="/factory/story-shorts">Story Shorts</Link>
          <Link href="/factory/music">Музыка</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>Шаблоны персонажей</h1>
          <p>
            Шаблон теперь хранит не только позицию, размер и зеркальность, но и
            конкретное видео персонажа. Например: Lana template = Lana video,
            Mia template = Mia video, Amelia template = Amelia video.
          </p>

          <div className="template-editor">
            <form className="grid" onSubmit={saveTemplate}>
              <label>
                Название шаблона
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Lana / Mia / Amelia"
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

              <div className="corner-buttons">
                <button type="button" onClick={() => setCorner("top-left")}>
                  Слева сверху
                </button>
                <button type="button" onClick={() => setCorner("top-right")}>
                  Справа сверху
                </button>
                <button type="button" onClick={() => setCorner("bottom-left")}>
                  Слева снизу
                </button>
                <button type="button" onClick={() => setCorner("bottom-right")}>
                  Справа снизу
                </button>
              </div>

              <div className="grid grid-2">
                <label>
                  X: {lanaX}%
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={lanaX}
                    onChange={(event) => setLanaX(Number(event.target.value))}
                  />
                </label>

                <label>
                  Y: {lanaY}%
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={lanaY}
                    onChange={(event) => setLanaY(Number(event.target.value))}
                  />
                </label>

                <label>
                  Ширина: {lanaWidth}px
                  <input
                    type="range"
                    min="120"
                    max="760"
                    value={lanaWidth}
                    onChange={(event) => setLanaWidth(Number(event.target.value))}
                  />
                </label>

                <label>
                  Высота: {lanaHeight}px
                  <input
                    type="range"
                    min="120"
                    max="1200"
                    value={lanaHeight}
                    onChange={(event) =>
                      setLanaHeight(Number(event.target.value))
                    }
                  />
                </label>
              </div>

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

              {error ? <p className="error">{error}</p> : null}

              <button type="submit">Сохранить шаблон</button>
            </form>

            <div className="template-preview">
              <div className="preview-game">GAME VIDEO</div>
              <div
                className={`preview-lana ${mirrorLana ? "mirror" : ""}`}
                style={{
                  width: `${(lanaWidth / 1080) * 100}%`,
                  height: `${(lanaHeight / 1920) * 100}%`,
                  left: `${lanaX}%`,
                  top: `${lanaY}%`,
                }}
              >
                {selectedAsset?.title ?? "PERSON"}
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
                <th>Позиция</th>
                <th>Размер</th>
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
                  <td>
                    X {template.lanaX}% / Y {template.lanaY}%
                  </td>
                  <td>
                    {template.lanaWidth}x{template.lanaHeight}
                  </td>
                  <td>{template.mirrorLana ? "Да" : "Нет"}</td>
                  <td>
                    <div className="inline-actions">
                      <button type="button" onClick={() => makeDefault(template.id)}>
                        Сделать основным
                      </button>
                      <button type="button" onClick={() => removeTemplate(template.id)}>
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {templates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
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
