"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Source = {
  id: string;
  sourceUrl: string;
  sourceTitle: string | null;
  isEnabled: boolean;
  dailyLimit: number;
  publishStartHour: number;
  publishEndHour: number;
  timezone: string;
  lastRunAt: string | null;
  lastError: string | null;
  _count: { videos: number };
};

type DownloaderConfig = {
  provider: string;
  allowYtDlpFallback: boolean;
  preferredQuality: string;
};

<<<<<<< HEAD
const DEFAULT_AUTO_SOURCE_TIMEZONE = "Europe/Moscow";

function normalizeTimezone(timezone: string) {
  return timezone === "America/New_York" ? DEFAULT_AUTO_SOURCE_TIMEZONE : timezone;
}

function timezoneLabel(timezone: string) {
  const normalized = normalizeTimezone(timezone);
  return normalized === DEFAULT_AUTO_SOURCE_TIMEZONE ? "МСК (Europe/Moscow)" : normalized;
}

=======
>>>>>>> e69342d9ff2972d7b19aa9106f14b89241b46dc8
export default function AutoSourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [downloader, setDownloader] = useState<DownloaderConfig | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/factory/auto-sources", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось загрузить источники");
    setSources(data.sources);
    setDownloader(data.downloader);
  }, []);

  useEffect(() => { load().catch((error) => setMessage(error.message)); }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy("add"); setMessage("");
    try {
<<<<<<< HEAD
      const response = await fetch("/api/factory/auto-sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceUrl, timezone: DEFAULT_AUTO_SOURCE_TIMEZONE }) });
=======
      const response = await fetch("/api/factory/auto-sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceUrl }) });
>>>>>>> e69342d9ff2972d7b19aa9106f14b89241b46dc8
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось добавить источник");
      setSourceUrl(""); setMessage("Источник добавлен"); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка"); }
    finally { setBusy(null); }
  }

  async function action(id: string, method: "PATCH" | "DELETE" | "RUN", body?: object) {
    setBusy(id); setMessage("");
    try {
      const url = method === "RUN" ? `/api/factory/auto-sources/${id}/run-now` : `/api/factory/auto-sources/${id}`;
      const response = await fetch(url, { method: method === "RUN" ? "POST" : method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Операция не выполнена");
      setMessage(method === "RUN" ? "Автозабор запущен" : "Сохранено"); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Ошибка"); }
    finally { setBusy(null); }
  }

  function configure(source: Source) {
    const dailyLimit = Number(window.prompt("Видео в день (1–20)", String(source.dailyLimit)));
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 20) return;
    const publishStartHour = Number(window.prompt("Начало окна (0–23)", String(source.publishStartHour)));
    const publishEndHour = Number(window.prompt("Конец окна (1–24)", String(source.publishEndHour)));
<<<<<<< HEAD
    const timezone = window.prompt("Часовой пояс IANA (МСК = Europe/Moscow)", normalizeTimezone(source.timezone))?.trim();
=======
    const timezone = window.prompt("Часовой пояс IANA", source.timezone)?.trim();
>>>>>>> e69342d9ff2972d7b19aa9106f14b89241b46dc8
    if (!timezone || publishEndHour <= publishStartHour) return;
    void action(source.id, "PATCH", { dailyLimit, publishStartHour, publishEndHour, timezone });
  }

  return (
    <main className="page"><div className="shell">
      <nav className="nav"><Link href="/factory">Завод</Link><Link href="/factory/super-upload">Супер залив</Link><Link href="/factory/auto-sources">VK автозабор</Link><Link href="/factory/accounts">Аккаунты</Link></nav>
      <section className="factory-hero-card"><div><p className="factory-eyebrow">Content Factory</p><h1>VK автозабор</h1><p>Ежедневно находит новые видео, создаёт по одной публикации на видео и распределяет их по окну.</p></div></section>
      <section className="factory-panel"><h2>Downloader</h2><div className="factory-grid-cards"><div className="factory-stat-card"><span>Provider</span><strong style={{ fontSize: 20 }}>{downloader?.provider || "vkvideodownload"}</strong></div><div className="factory-stat-card"><span>Основной сервис</span><strong style={{ fontSize: 20 }}>vkvideodownload.com</strong></div><div className="factory-stat-card"><span>Качество</span><strong style={{ fontSize: 24 }}>{downloader?.preferredQuality || "720p"}</strong></div><div className="factory-stat-card"><span>yt-dlp fallback</span><strong style={{ fontSize: 24 }}>{downloader?.allowYtDlpFallback ? "ON" : "OFF"}</strong></div></div></section>
      <section className="factory-panel">
        <h2>Добавить источник</h2>
        <form className="inline-actions" onSubmit={add}><input required type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://vk.com/videos-123456789"/><button disabled={busy === "add"}>Добавить</button></form>
        {message && <p className={message.includes("Ошибка") || message.includes("не ") ? "factory-error-text" : "factory-success-text"}>{message}</p>}
      </section>
      <section className="factory-panel"><h2>Источники</h2>
        {!sources.length ? <div className="empty-state"><strong>Источников пока нет</strong><span>Добавьте VK-группу или VK Video канал.</span></div> :
          <div className="factory-table-wrap"><table className="factory-table"><thead><tr><th>Источник</th><th>Настройки</th><th>Состояние</th><th>Действия</th></tr></thead><tbody>
            {sources.map((source) => <tr key={source.id}>
              <td><strong>{source.sourceTitle || source.sourceUrl}</strong><small>{source._count.videos} сохранённых видео</small></td>
<<<<<<< HEAD
              <td>{source.dailyLimit} в день<br/>{source.publishStartHour}:00–{source.publishEndHour}:00 МСК<br/><small>{timezoneLabel(source.timezone)}</small></td>
              <td><span className={source.isEnabled ? "factory-status-ok" : "factory-status-warn"}>{source.isEnabled ? "Включён" : "Пауза"}</span><br/><small>{source.lastRunAt ? `Запуск: ${new Date(source.lastRunAt).toLocaleString("ru-RU", { timeZone: normalizeTimezone(source.timezone) })}` : "Ещё не запускался"}</small>{source.lastError && <p className="factory-error-text">{source.lastError}</p>}</td>
=======
              <td>{source.dailyLimit} в день<br/>{source.publishStartHour}:00–{source.publishEndHour}:00<br/><small>{source.timezone}</small></td>
              <td><span className={source.isEnabled ? "factory-status-ok" : "factory-status-warn"}>{source.isEnabled ? "Включён" : "Пауза"}</span><br/><small>{source.lastRunAt ? `Запуск: ${new Date(source.lastRunAt).toLocaleString("ru-RU")}` : "Ещё не запускался"}</small>{source.lastError && <p className="factory-error-text">{source.lastError}</p>}</td>
>>>>>>> e69342d9ff2972d7b19aa9106f14b89241b46dc8
              <td><div className="factory-row-actions"><button disabled={busy === source.id} onClick={() => action(source.id, "RUN")}>Запустить</button><button className="secondary-button" disabled={busy === source.id} onClick={() => configure(source)}>Настроить</button><button className="secondary-button" disabled={busy === source.id} onClick={() => action(source.id, "PATCH", { isEnabled: !source.isEnabled })}>{source.isEnabled ? "Пауза" : "Включить"}</button><button className="secondary-button" disabled={busy === source.id} onClick={() => action(source.id, "DELETE")}>Удалить</button></div></td>
            </tr>)}</tbody></table></div>}
      </section>
    </div></main>
  );
}
