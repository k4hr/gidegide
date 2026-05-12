"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FactoryAsset = {
  id: string;
  title: string;
  originalName: string | null;
};

type TemplateKind = "SHORTS_9_16" | "LONG_16_9";
type FacecamPosition = "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT";

type FactoryTemplate = {
  id: string;
  name: string;
  isDefault: boolean;
  mirrorLana: boolean;
  kind: TemplateKind;
  facecamPosition: FacecamPosition;
  facecamWidthPercent: number;
  facecamMarginPercent: number;
  facecamBorderRadius: number;
  asset: FactoryAsset | null;
};

const positions: Array<{ value: FacecamPosition; label: string }> = [
  { value: "TOP_LEFT", label: "Слева сверху" },
  { value: "TOP_RIGHT", label: "Справа сверху" },
  { value: "BOTTOM_LEFT", label: "Слева снизу" },
  { value: "BOTTOM_RIGHT", label: "Справа снизу" },
];

function positionLabel(value: FacecamPosition) {
  return positions.find((position) => position.value === value)?.label ?? value;
}

export default function FactoryTemplatesPage() {
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [assets, setAssets] = useState<FactoryAsset[]>([]);
  const [name, setName] = useState("Amelia watch");
  const [assetId, setAssetId] = useState("");
  const [mirrorLana, setMirrorLana] = useState(false);
  const [isDefault, setIsDefault] = useState(true);
  const [kind, setKind] = useState<TemplateKind>("SHORTS_9_16");
  const [facecamPosition, setFacecamPosition] = useState<FacecamPosition>("TOP_LEFT");
  const [facecamWidthPercent, setFacecamWidthPercent] = useState(24);
  const [facecamMarginPercent, setFacecamMarginPercent] = useState(3);
  const [facecamBorderRadius, setFacecamBorderRadius] = useState(18);
  const [error, setError] = useState("");

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === assetId) ?? null,
    [assets, assetId],
  );

  async function loadTemplates() {
    const response = await fetch("/api/factory/templates", { cache: "no-store" });
    const data = (await response.json()) as { templates: FactoryTemplate[] };
    setTemplates(data.templates ?? []);
  }

  async function loadAssets() {
    const response = await fetch("/api/factory/assets", { cache: "no-store" });
    const data = (await response.json()) as { assets: FactoryAsset[] };
    setAssets(data.assets ?? []);

    if (!assetId && data.assets?.[0]) {
      setAssetId(data.assets[0].id);
    }
  }

  useEffect(() => {
    loadTemplates();
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          assetId,
          lanaX: 0,
          lanaY: 50,
          lanaWidth: 1080,
          lanaHeight: 960,
          mirrorLana,
          isDefault,
          kind,
          facecamPosition,
          facecamWidthPercent,
          facecamMarginPercent,
          facecamBorderRadius,
        }),
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось сохранить шаблон");
      }

      await loadTemplates();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не получилось сохранить шаблон");
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/super-upload">СУПЕР ЗАЛИВ</Link>
          <Link href="/factory/long-video">Видео 16:9</Link>
          <Link href="/factory/analytics">Аналитика</Link>
          <Link href="/factory/assets">Видео персонажей</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>Шаблоны персонажей</h1>
          <p>
            Один и тот же asset можно использовать для Shorts 9:16 и для обычных
            YouTube-видео 16:9. Для 16:9 выбирается позиция facecam в углу.
          </p>

          <div className="template-editor split-template-editor">
            <form className="grid" onSubmit={saveTemplate}>
              <label>
                Название шаблона
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>

              <label>
                Видео персонажа
                <select value={assetId} onChange={(event) => setAssetId(event.target.value)} required>
                  {assets.length === 0 ? <option value="">Сначала загрузи видео персонажа</option> : null}
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.title}{asset.originalName ? ` — ${asset.originalName}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-2">
                <label>
                  Тип шаблона
                  <select value={kind} onChange={(event) => setKind(event.target.value as TemplateKind)}>
                    <option value="SHORTS_9_16">Shorts 9:16 — игра сверху, персонаж снизу</option>
                    <option value="LONG_16_9">Видео 16:9 — facecam поверх игры</option>
                  </select>
                </label>

                <label>
                  Отзеркалить персонажа
                  <select value={mirrorLana ? "yes" : "no"} onChange={(event) => setMirrorLana(event.target.value === "yes")}>
                    <option value="no">Нет</option>
                    <option value="yes">Да</option>
                  </select>
                </label>
              </div>

              {kind === "LONG_16_9" ? (
                <div className="grid grid-3">
                  <label>
                    Позиция facecam
                    <select value={facecamPosition} onChange={(event) => setFacecamPosition(event.target.value as FacecamPosition)}>
                      {positions.map((position) => (
                        <option key={position.value} value={position.value}>{position.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Размер, % ширины
                    <input type="number" min={12} max={40} value={facecamWidthPercent} onChange={(event) => setFacecamWidthPercent(Number(event.target.value))} />
                  </label>
                  <label>
                    Отступ, %
                    <input type="number" min={1} max={10} value={facecamMarginPercent} onChange={(event) => setFacecamMarginPercent(Number(event.target.value))} />
                  </label>
                </div>
              ) : null}

              <label>
                Использовать по умолчанию
                <select value={isDefault ? "yes" : "no"} onChange={(event) => setIsDefault(event.target.value === "yes")}>
                  <option value="yes">Да</option>
                  <option value="no">Нет</option>
                </select>
              </label>

              {error ? <p className="error">{error}</p> : null}
              <button type="submit">Сохранить шаблон</button>
            </form>

            <div className={kind === "LONG_16_9" ? "long-template-preview" : "split-template-preview"}>
              {kind === "SHORTS_9_16" ? (
                <>
                  <div className="split-preview-half split-preview-game"><span>GAME VIDEO</span></div>
                  <div className={`split-preview-half split-preview-person ${mirrorLana ? "mirror" : ""}`}><span>{selectedAsset?.title ?? "PERSON VIDEO"}</span></div>
                </>
              ) : (
                <div className="long-preview-screen">
                  <span className="long-preview-game-label">1920×1080 GAMEPLAY</span>
                  <span className={`long-preview-facecam ${facecamPosition.toLowerCase().replace("_", "-")}`}>{selectedAsset?.title ?? "FACE CAM"}</span>
                </div>
              )}
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
                <th>Тип</th>
                <th>Настройки</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id}>
                  <td>
                    {template.name} {template.isDefault ? <span className="badge">default</span> : null}
                  </td>
                  <td>{template.asset ? <b>{template.asset.title}</b> : <span className="error">Видео не выбрано</span>}</td>
                  <td>{template.kind === "LONG_16_9" ? "Видео 16:9" : "Shorts 9:16"}</td>
                  <td>
                    {template.kind === "LONG_16_9"
                      ? `${positionLabel(template.facecamPosition)} · ${template.facecamWidthPercent}% · отступ ${template.facecamMarginPercent}%`
                      : "50/50: игра сверху, персонаж снизу"}
                  </td>
                </tr>
              ))}
              {templates.length === 0 ? (
                <tr><td colSpan={4} className="muted">Пока шаблонов нет.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
