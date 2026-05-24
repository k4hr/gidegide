"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FactoryAccount = {
  id: string;
  platform: "YOUTUBE" | "TIKTOK";
  name: string;
};

type FactoryTemplate = {
  id: string;
  name: string;
  isDefault: boolean;
  kind?: "SHORTS_9_16" | "LONG_16_9";
  facecamPosition?: "TOP_LEFT" | "TOP_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_RIGHT";
  facecamWidthPercent?: number;
  facecamMarginPercent?: number;
  facecamCropZoomPercent?: number;
  facecamCropFocusXPercent?: number;
  facecamCropFocusYPercent?: number;
};

const positionLabels: Record<NonNullable<FactoryTemplate["facecamPosition"]>, string> = {
  TOP_LEFT: "слева сверху",
  TOP_RIGHT: "справа сверху",
  BOTTOM_LEFT: "слева снизу",
  BOTTOM_RIGHT: "справа снизу",
};

function templateSummary(template?: FactoryTemplate) {
  if (!template) {
    return "Выбери шаблон — позиция, размер окна, отступ и обрезка реакции подтянутся из него автоматически.";
  }

  const position = positionLabels[template.facecamPosition ?? "TOP_LEFT"];
  const width = template.facecamWidthPercent ?? 24;
  const margin = template.facecamMarginPercent ?? 3;
  const crop = template.facecamCropZoomPercent ?? 135;
  const focusX = template.facecamCropFocusXPercent ?? 50;
  return `Окно реакции: ${position}, ширина ${width}% от 1920px, отступ ${margin}%, обрезка боков ${crop}%, центр X ${focusX}%. Верх и низ реакции не обрезаются. Изменяется только в разделе “Шаблоны”.`;
}

export default function FactoryLongVideoPage() {
  const [accounts, setAccounts] = useState<FactoryAccount[]>([]);
  const [templates, setTemplates] = useState<FactoryTemplate[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const youtubeAccounts = useMemo(
    () => accounts.filter((account) => account.platform === "YOUTUBE"),
    [accounts],
  );

  const longVideoTemplates = useMemo(() => {
    const longOnly = templates.filter((template) => !template.kind || template.kind === "LONG_16_9");
    return longOnly.length > 0 ? longOnly : templates;
  }, [templates]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId),
    [templates, templateId],
  );

  async function loadData() {
    const [accountsResponse, templatesResponse] = await Promise.all([
      fetch("/api/factory/accounts", { cache: "no-store" }),
      fetch("/api/factory/templates", { cache: "no-store" }),
    ]);
    const accountsData = (await accountsResponse.json()) as { accounts: FactoryAccount[] };
    const templatesData = (await templatesResponse.json()) as { templates: FactoryTemplate[] };

    setAccounts(accountsData.accounts ?? []);
    setTemplates(templatesData.templates ?? []);

    const youtube = accountsData.accounts?.find((account) => account.platform === "YOUTUBE");
    const longTemplate =
      templatesData.templates?.find((template) => template.kind === "LONG_16_9")
      ?? templatesData.templates?.find((template) => !template.kind)
      ?? templatesData.templates?.[0];

    if (youtube) setAccountId((current) => current || youtube.id);
    if (longTemplate) setTemplateId((current) => current || longTemplate.id);
  }

  useEffect(() => {
    loadData().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Не получилось загрузить данные");
    });
  }, []);

  async function createLongVideo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("sourceUrl", sourceUrl.trim());
      if (sourceFile) formData.set("sourceFile", sourceFile);
      if (thumbnailFile) formData.set("thumbnailFile", thumbnailFile);
      formData.set("title", title.trim());
      formData.set("description", description.trim());
      formData.set("accountId", accountId);
      formData.set("templateId", templateId);
      formData.set("scheduledAt", scheduledAt);

      const response = await fetch("/api/factory/long-video", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { job?: { id: string }; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось создать задачу");
      }

      setMessage("Задача 16:9 создана. Открой /factory и следи за worker.");
      setSourceUrl("");
      setSourceFile(null);
      setThumbnailFile(null);
      setTitle("");
      setDescription("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не получилось создать задачу");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/super-upload">СУПЕР ЗАЛИВ</Link>
          <Link href="/factory/story-shorts">Story Shorts</Link>
          <Link href="/factory/movie-moments">Кино моменты</Link>
          <Link href="/factory/music">Музыка</Link>
          <Link href="/factory/long-video">Видео 16:9</Link>
          <Link href="/factory/analytics">Аналитика</Link>
          <Link href="/factory/assets">Видео персонажей</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card long-video-hero">
          <div>
            <span className="pill">FULL VIDEO 16:9</span>
            <h1>Видео 16:9</h1>
            <p>
              Длинный Roblox-ролик остается 1920×1080 во весь экран, а реакция
              накладывается как facecam в выбранный угол. Реакция автоматически
              зацикливается до конца видео.
            </p>
          </div>
        </section>

        <section className="card">
          <form className="grid long-video-form" onSubmit={createLongVideo}>
            <label>
              Ссылка на длинный Roblox-видео
              <input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </label>

            <label>
              Или загрузи MP4-файл
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/*"
                onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <label>
              Название ролика
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Roblox horror challenge with Amelia reaction"
                maxLength={100}
                required
              />
            </label>

            <label>
              Описание ролика
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Описание для YouTube..."
                rows={6}
              />
            </label>

            <label>
              Превью ролика
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(event) => setThumbnailFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <div className="grid grid-2">
              <label>
                YouTube-аккаунт
                <select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
                  <option value="">Выбери аккаунт</option>
                  {youtubeAccounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Шаблон реакции
                <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} required>
                  <option value="">Выбери шаблон</option>
                  {longVideoTemplates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
                <small className="muted">Позиция, размер, отступ и обрезка реакции задаются в самом шаблоне.</small>
              </label>
            </div>

            <div className="template-summary">
              <strong>Настройки выбранного шаблона</strong>
              <p>{templateSummary(selectedTemplate)}</p>
              <Link href="/factory/templates">Изменить шаблон</Link>
            </div>

            <label>
              Запланировать публикацию, опционально
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </label>

            {error ? <p className="error">{error}</p> : null}
            {message ? <p className="success">{message}</p> : null}

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Создаю..." : "Создать 16:9 видео"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
