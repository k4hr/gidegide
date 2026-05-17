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
};

const positions = [
  { value: "TOP_LEFT", label: "Слева сверху" },
  { value: "TOP_RIGHT", label: "Справа сверху" },
  { value: "BOTTOM_LEFT", label: "Слева снизу" },
  { value: "BOTTOM_RIGHT", label: "Справа снизу" },
] as const;

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
  const [facecamPosition, setFacecamPosition] = useState<(typeof positions)[number]["value"]>("TOP_LEFT");
  const [facecamWidthPercent, setFacecamWidthPercent] = useState(24);
  const [facecamMarginPercent, setFacecamMarginPercent] = useState(3);
  const [scheduledAt, setScheduledAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const youtubeAccounts = useMemo(
    () => accounts.filter((account) => account.platform === "YOUTUBE"),
    [accounts],
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
    const longTemplate = templatesData.templates?.find((template) => template.kind === "LONG_16_9") ?? templatesData.templates?.[0];

    if (youtube) setAccountId((current) => current || youtube.id);
    if (longTemplate) {
      setTemplateId((current) => current || longTemplate.id);
      setFacecamPosition(longTemplate.facecamPosition ?? "TOP_LEFT");
    }
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
      formData.set("facecamPosition", facecamPosition);
      formData.set("facecamWidthPercent", String(facecamWidthPercent));
      formData.set("facecamMarginPercent", String(facecamMarginPercent));
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
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-3">
              <label>
                Позиция реакции
                <select value={facecamPosition} onChange={(event) => setFacecamPosition(event.target.value as typeof facecamPosition)}>
                  {positions.map((position) => (
                    <option key={position.value} value={position.value}>{position.label}</option>
                  ))}
                </select>
              </label>

              <label>
                Ширина окна реакции, % от ширины итогового видео
                <input
                  type="number"
                  min={12}
                  max={40}
                  value={facecamWidthPercent}
                  onChange={(event) => setFacecamWidthPercent(Number(event.target.value))}
                />
                <small className="muted">40 = окно реакции занимает 40% ширины финального 16:9 видео. Для 1920px это примерно 768px.</small>
              </label>

              <label>
                Отступ от краев, % от размера итогового видео
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={facecamMarginPercent}
                  onChange={(event) => setFacecamMarginPercent(Number(event.target.value))}
                />
                <small className="muted">По X считается от 1920px, по Y — от 1080px.</small>
              </label>
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
