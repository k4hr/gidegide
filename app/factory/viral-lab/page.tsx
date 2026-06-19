"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ViralReference = {
  id: string;
  title: string | null;
  sourceType: "FILE" | "ZIP" | "URL";
  sourceUrl: string | null;
  originalName: string | null;
  durationSec: number | null;
  status: "UPLOADED" | "QUEUED" | "ANALYZING" | "ANALYZED" | "FAILED";
  errorMessage: string | null;
  analyzedAt: string | null;
  createdAt: string;
  analysis: null | {
    hookType: string | null;
    hookLengthSec: number | null;
    storyType: string | null;
    pacingStyle: string | null;
    musicMood: string | null;
    endingLogic: string | null;
    titlePattern: string | null;
    viralScore: number;
    extractedFormula: unknown;
  };
};

type ViralFormula = {
  id: string;
  name: string;
  hookType: string;
  storyType: string;
  musicMood: string;
  titlePattern: string;
  endingLogic: string;
  confidenceScore: number;
  sourceCount: number;
  notes: string | null;
  updatedAt: string;
};

type BrainSnapshot = {
  id: string;
  referencesCount: number;
  formulasCount: number;
  topHookTypes: Array<{ name: string; count: number }>;
  topStoryTypes: Array<{ name: string; count: number }>;
  topMusicMoods: Array<{ name: string; count: number }>;
  titlePatterns: Array<{ pattern: string; storyType: string; score: number }>;
  promptContext: string;
  createdAt: string;
};

type PageData = {
  references: ViralReference[];
  formulas: ViralFormula[];
  latestBrain: BrainSnapshot | null;
  brainReady: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function statusClass(status: ViralReference["status"]) {
  if (status === "ANALYZED") return "factory-status-ok";
  if (status === "FAILED") return "factory-status-danger";
  return "factory-status-warn";
}

function statusLabel(status: ViralReference["status"]) {
  const labels = {
    UPLOADED: "Загружен",
    QUEUED: "В очереди",
    ANALYZING: "AI анализирует",
    ANALYZED: "Формула готова",
    FAILED: "Ошибка",
  } satisfies Record<ViralReference["status"], string>;
  return labels[status];
}

function formatSeconds(value: number | null) {
  if (!value) return "—";
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text.trim()) {
    throw new Error(`Пустой ответ API (${response.status}). Проверь /api/factory/viral-lab в логах Railway.`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, " ").slice(0, 260);
    throw new Error(`API вернул не JSON (${response.status}): ${preview}`);
  }
}

async function fetchApiJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const json = await readJsonResponse<{ error?: string } & T>(response);

  if (!response.ok) {
    throw new Error(json.error ?? `Ошибка API ${response.status}`);
  }

  return json;
}

export default function ViralLabPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [files, setFiles] = useState<FileList | null>(null);
  const [urls, setUrls] = useState("");
  const [analyzeNow, setAnalyzeNow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const json = await fetchApiJson<PageData>("/api/factory/viral-lab", { cache: "no-store" });
    setData(json);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "Ошибка загрузки"));
  }, []);

  const stats = useMemo(() => {
    const references = data?.references ?? [];
    return {
      total: references.length,
      analyzed: references.filter((item) => item.status === "ANALYZED").length,
      queued: references.filter((item) => item.status === "QUEUED" || item.status === "UPLOADED").length,
      failed: references.filter((item) => item.status === "FAILED").length,
    };
  }, [data]);

  async function uploadFiles() {
    if (!files?.length) {
      setMessage("Выбери mp4/mov/webm референсы");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      formData.append("analyzeNow", String(analyzeNow));

      const json = await fetchApiJson<{ message?: string }>("/api/factory/viral-lab", {
        method: "POST",
        body: formData,
      });
      setMessage(json.message ?? "Референсы загружены");
      setFiles(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  async function addUrls() {
    const list = urls.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
    if (list.length === 0) {
      setMessage("Вставь ссылки на Shorts/TikTok/Reels");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const json = await fetchApiJson<{ message?: string }>("/api/factory/viral-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: list }),
      });
      setUrls("");
      setMessage(json.message ?? "Ссылки сохранены");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сохранения ссылок");
    } finally {
      setLoading(false);
    }
  }

  async function analyze(id?: string) {
    setAnalyzing(true);
    setMessage(null);

    try {
      const json = await fetchApiJson<{ message?: string }>("/api/factory/viral-lab/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : { limit: 100 }),
      });
      setMessage(json.message ?? "Анализ завершен");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка анализа");
    } finally {
      setAnalyzing(false);
    }
  }

  async function removeReference(id: string) {
    setLoading(true);
    setMessage(null);

    try {
      const json = await fetchApiJson<{ message?: string }>("/api/factory/viral-lab", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setMessage(json.message ?? "Удалено");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка удаления");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="factory-shell">
      <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/super-upload">Супер залив</Link>
          <Link href="/factory/story-shorts">Story Shorts</Link>
          <Link href="/factory/music">Музыка</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

      <section className="factory-panel factory-panel-wide viral-lab-hero">
        <div className="factory-eyebrow">VIRAL LAB / ROBLOX BRAIN</div>
        <h1>Вирусная лаборатория</h1>
        <p className="factory-muted">
          Загружаешь 50–100 залетевших Roblox Shorts. AI вытаскивает формулы: хук, story type, overlay text, эмодзи, музыку, pacing, финал и title pattern. Потом Story Shorts использует этот мозг при создании новых роликов.
        </p>
        <div className="factory-row-actions">
          <Link href="/factory/story-shorts">Перейти к Story Shorts</Link>
          <button type="button" className="factory-secondary-button" disabled={analyzing} onClick={() => analyze()}>
            {analyzing ? "Анализирую..." : "Анализировать всю очередь"}
          </button>
        </div>
      </section>

      <section className="factory-panel factory-panel-wide">
        <div className="analytics-summary-grid viral-summary-grid">
          <div className="factory-stat-card"><strong>{stats.total}</strong><span>референсов</span></div>
          <div className="factory-stat-card"><strong>{stats.analyzed}</strong><span>проанализировано</span></div>
          <div className="factory-stat-card"><strong>{data?.formulas.length ?? 0}</strong><span>формул</span></div>
          <div className="factory-stat-card"><strong>{stats.queued}</strong><span>в очереди</span></div>
          <div className="factory-stat-card"><strong>{stats.failed}</strong><span>ошибок</span></div>
          <div className="factory-stat-card"><strong>{data?.brainReady ? "ON" : "OFF"}</strong><span>мозг Story Shorts</span></div>
        </div>
        {message ? <p className="factory-error-text">{message}</p> : null}
      </section>

      <section className="factory-panel factory-panel-wide">
        <div className="factory-row-between">
          <div>
            <div className="factory-eyebrow">UPLOAD REFERENCES</div>
            <h2>Загрузка файлов</h2>
            <p className="factory-muted">Можно загрузить пачку mp4/webm/mov или один ZIP-архив с 50–100 роликами.</p>
          </div>
          <label className="factory-checkbox-row">
            <input type="checkbox" checked={analyzeNow} onChange={(event) => setAnalyzeNow(event.target.checked)} />
            Сразу анализировать после загрузки
          </label>
        </div>
        <div className="factory-inline-form">
          <input type="file" multiple accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm,.zip" onChange={(event) => setFiles(event.target.files)} />
          <button type="button" className="factory-secondary-button" disabled={loading} onClick={uploadFiles}>
            {loading ? "Загружаю..." : "+ Загрузить референсы"}
          </button>
        </div>
      </section>

      <section className="factory-panel factory-panel-wide">
        <div className="factory-eyebrow">LINKS</div>
        <h2>Ссылки на Shorts / TikTok / Reels</h2>
        <p className="factory-muted">Ссылки сохраняются в очередь как источник. Для полного анализа ссылок нужен рабочий скачиватель, поэтому надежнее сейчас грузить файлы.</p>
        <textarea className="factory-textarea" value={urls} onChange={(event) => setUrls(event.target.value)} placeholder="Одна ссылка на строку" />
        <button type="button" className="factory-secondary-button" disabled={loading} onClick={addUrls}>Сохранить ссылки</button>
      </section>

      <section className="factory-panel factory-panel-wide">
        <div className="factory-row-between">
          <div>
            <div className="factory-eyebrow">AI BRAIN</div>
            <h2>Общий мозг системы</h2>
          </div>
          <div className="factory-muted">Последняя сборка: {formatDate(data?.latestBrain?.createdAt ?? null)}</div>
        </div>
        {data?.latestBrain ? (
          <div className="viral-brain-grid">
            <article className="factory-card">
              <h3>Топ хуки</h3>
              {(data.latestBrain.topHookTypes ?? []).map((item) => <p key={item.name}>{item.name} · {item.count}</p>)}
            </article>
            <article className="factory-card">
              <h3>Топ истории</h3>
              {(data.latestBrain.topStoryTypes ?? []).map((item) => <p key={item.name}>{item.name} · {item.count}</p>)}
            </article>
            <article className="factory-card">
              <h3>Топ музыка</h3>
              {(data.latestBrain.topMusicMoods ?? []).map((item) => <p key={item.name}>{item.name} · {item.count}</p>)}
            </article>
            <article className="factory-card viral-prompt-card">
              <h3>Prompt context</h3>
              <pre>{data.latestBrain.promptContext}</pre>
            </article>
          </div>
        ) : (
          <p className="factory-muted">Пока нет собранного мозга. Загрузи и проанализируй первые референсы.</p>
        )}
      </section>

      <section className="factory-panel factory-panel-wide">
        <div className="factory-eyebrow">FORMULA LIBRARY</div>
        <h2>Библиотека вирусных формул</h2>
        <div className="factory-grid-cards">
          {(data?.formulas ?? []).map((formula) => (
            <article className="factory-card" key={formula.id}>
              <div className="factory-eyebrow">{formula.confidenceScore}/100 · {formula.sourceCount} refs</div>
              <h3>{formula.name}</h3>
              <p><b>Story:</b> {formula.storyType}</p>
              <p><b>Hook:</b> {formula.hookType}</p>
              <p><b>Music:</b> {formula.musicMood}</p>
              <p><b>Title:</b> {formula.titlePattern}</p>
              <p className="factory-muted">{formula.notes}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="factory-panel factory-panel-wide">
        <div className="factory-eyebrow">REFERENCES</div>
        <h2>Загруженные референсы</h2>
        <div className="viral-reference-list">
          {(data?.references ?? []).map((reference) => (
            <article className="factory-card viral-reference-card" key={reference.id}>
              <div>
                <span className={statusClass(reference.status)}>{statusLabel(reference.status)}</span>
                <h3>{reference.title ?? reference.originalName ?? reference.sourceUrl ?? "Без названия"}</h3>
                <p className="factory-muted">
                  {reference.sourceType} · {formatSeconds(reference.durationSec)} · создан {formatDate(reference.createdAt)}
                </p>
                {reference.analysis ? (
                  <div className="viral-analysis-line">
                    <span>{reference.analysis.viralScore}/100</span>
                    <span>{reference.analysis.storyType}</span>
                    <span>{reference.analysis.hookType}</span>
                    <span>{reference.analysis.musicMood}</span>
                    <span>{reference.analysis.titlePattern}</span>
                  </div>
                ) : null}
                {reference.errorMessage ? <p className="factory-error-text">{reference.errorMessage}</p> : null}
              </div>
              <div className="factory-row-actions">
                {reference.status !== "ANALYZED" && reference.sourceType !== "URL" ? (
                  <button type="button" className="factory-secondary-button" disabled={analyzing} onClick={() => analyze(reference.id)}>
                    Анализ
                  </button>
                ) : null}
                {reference.sourceUrl ? <a href={reference.sourceUrl} target="_blank" rel="noreferrer">Открыть</a> : null}
                <button type="button" className="factory-secondary-button" disabled={loading} onClick={() => removeReference(reference.id)}>
                  Удалить
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
