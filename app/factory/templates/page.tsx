"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FactoryTemplate = {
  id: string;
  name: string;
  isDefault: boolean;
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
  const [name, setName] = useState("My Lana Template");
  const [lanaX, setLanaX] = useState(78);
  const [lanaY, setLanaY] = useState(68);
  const [lanaWidth, setLanaWidth] = useState(300);
  const [lanaHeight, setLanaHeight] = useState(533);
  const [mirrorLana, setMirrorLana] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [error, setError] = useState("");

  async function loadTemplates() {
    const response = await fetch("/api/factory/templates", {
      cache: "no-store",
    });

    const data = (await response.json()) as {
      templates: FactoryTemplate[];
    };

    setTemplates(data.templates);
  }

  useEffect(() => {
    loadTemplates();
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
      const response = await fetch("/api/factory/templates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
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
          <Link href="/factory/assets">Видео Ланы</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>Шаблоны Ланы</h1>
          <p>
            Настраиваешь положение, размер и зеркальность Ланы. Сохраняешь шаблон
            и потом используешь его при создании роликов.
          </p>

          <div className="template-editor">
            <form className="grid" onSubmit={saveTemplate}>
              <label>
                Название шаблона
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>

              <div className="corner-buttons">
                <button type="button" onClick={() => setCorner("top-left")}>
                  Лана слева сверху
                </button>
                <button type="button" onClick={() => setCorner("top-right")}>
                  Лана справа сверху
                </button>
                <button type="button" onClick={() => setCorner("bottom-left")}>
                  Лана слева снизу
                </button>
                <button type="button" onClick={() => setCorner("bottom-right")}>
                  Лана справа снизу
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
                  Ширина Ланы: {lanaWidth}px
                  <input
                    type="range"
                    min="120"
                    max="760"
                    value={lanaWidth}
                    onChange={(event) => setLanaWidth(Number(event.target.value))}
                  />
                </label>

                <label>
                  Высота Ланы: {lanaHeight}px
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
                  Отзеркалить Лану
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
                LANA
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
