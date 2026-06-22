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
=======
type VkCookiesStatus = {
  enabled: boolean;
  source: string | null;
  cookieCount: number;
  domains: string[];
  authMode: string;
  vkCom?: boolean;
  vkVideo?: boolean;
  hasRemixsid?: boolean;
  hasRemixdsid?: boolean;
  hasRemixstid?: boolean;
};

type ListingConfig = {
  provider: string;
  playwright: boolean;
  ytDlpFallback: boolean;
  scrollPages: number;
  waitMs: number;
};

type CheckResult = {
  ok: boolean;
  foundCount: number;
  videos: Array<{ title?: string; videoUrl: string }>;
  candidatesTried: Array<{ url: string; status?: number; foundCount?: number; provider?: string; error?: string }>;
  error?: string | null;
};

>>>>>>> ffda38c13fc565af37b0c9e48986d7703a2a34d7
const DEFAULT_AUTO_SOURCE_TIMEZONE = "Europe/Moscow";

function normalizeTimezone(timezone: string) {
  return timezone === "America/New_York" ? DEFAULT_AUTO_SOURCE_TIMEZONE : timezone;
}

function timezoneLabel(timezone: string) {
  const normalized = normalizeTimezone(timezone);
  return normalized === DEFAULT_AUTO_SOURCE_TIMEZONE ? "МСК (Europe/Moscow)" : normalized;
}

export default function AutoSourcesPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [sourceUrl, setSourceUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [downloader, setDownloader] = useState<DownloaderConfig | null>(null);
  const [vkCookies, setVkCookies] = useState<VkCookiesStatus | null>(null);
  const [listing, setListing] = useState<ListingConfig | null>(null);
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});

  const load = useCallback(async () => {
    const response = await fetch("/api/factory/auto-sources", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Не удалось загрузить источники");
    setSources(data.sources);
    setDownloader(data.downloader);
    setVkCookies(data.vkCookies);
    setListing(data.listing);
  }, []);

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy("add");
    setMessage("");
    try {
<<<<<<< HEAD
      const response = await fetch("/api/factory/auto-sources", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceUrl }) });
=======
      const response = await fetch("/api/factory/auto-sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceUrl, timezone: DEFAULT_AUTO_SOURCE_TIMEZONE }),
      });
>>>>>>> ffda38c13fc565af37b0c9e48986d7703a2a34d7
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Не удалось добавить источник");
      setSourceUrl("");
      setMessage("Источник добавлен");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  }

  async function action(id: string, method: "PATCH" | "DELETE" | "RUN", body?: object) {
    setBusy(id);
    setMessage("");
    try {
      const url = method === "RUN" ? `/api/factory/auto-sources/${id}/run-now` : `/api/factory/auto-sources/${id}`;
      const response = await fetch(url, {
        method: method === "RUN" ? "POST" : method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Операция не выполнена");
      setMessage(method === "RUN" ? "Автозабор запущен" : "Сохранено");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  }

  async function checkSource(id: string) {
    setBusy(`check:${id}`);
    setMessage("");
    try {
      const response = await fetch(`/api/factory/auto-sources/${id}/check`, { method: "POST" });
      const data = await response.json() as CheckResult;
      if (!response.ok) throw new Error(data.error || "Проверка не выполнена");
      setChecks((current) => ({ ...current, [id]: data }));
      setMessage(data.ok ? `Источник читается. Найдено видео: ${data.foundCount}` : "Источник не прочитался. Смотри подсказки в карточке.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setBusy(null);
    }
  }

  function configure(source: Source) {
    const dailyLimit = Number(window.prompt("Видео в день (1–20)", String(source.dailyLimit)));
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 20) return;
    const publishStartHour = Number(window.prompt("Начало окна (0–23)", String(source.publishStartHour)));
    const publishEndHour = Number(window.prompt("Конец окна (1–24)", String(source.publishEndHour)));
    const timezone = window.prompt("Часовой пояс IANA (МСК = Europe/Moscow)", normalizeTimezone(source.timezone))?.trim();
    if (!timezone || publishEndHour <= publishStartHour) return;
    void action(source.id, "PATCH", { dailyLimit, publishStartHour, publishEndHour, timezone });
  }

  return (
<<<<<<< HEAD
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
              <td>{source.dailyLimit} в день<br/>{source.publishStartHour}:00–{source.publishEndHour}:00 МСК<br/><small>{timezoneLabel(source.timezone)}</small></td>
              <td><span className={source.isEnabled ? "factory-status-ok" : "factory-status-warn"}>{source.isEnabled ? "Включён" : "Пауза"}</span><br/><small>{source.lastRunAt ? `Запуск: ${new Date(source.lastRunAt).toLocaleString("ru-RU", { timeZone: normalizeTimezone(source.timezone) })}` : "Ещё не запускался"}</small>{source.lastError && <p className="factory-error-text">{source.lastError}</p>}</td>
              <td><div className="factory-row-actions"><button disabled={busy === source.id} onClick={() => action(source.id, "RUN")}>Запустить</button><button className="secondary-button" disabled={busy === source.id} onClick={() => configure(source)}>Настроить</button><button className="secondary-button" disabled={busy === source.id} onClick={() => action(source.id, "PATCH", { isEnabled: !source.isEnabled })}>{source.isEnabled ? "Пауза" : "Включить"}</button><button className="secondary-button" disabled={busy === source.id} onClick={() => action(source.id, "DELETE")}>Удалить</button></div></td>
            </tr>)}</tbody></table></div>}
      </section>
    </div></main>
=======
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/super-upload">Супер залив</Link>
          <Link href="/factory/auto-sources">VK автозабор</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="factory-hero-card">
          <div>
            <p className="factory-eyebrow">Content Factory</p>
            <h1>VK автозабор</h1>
            <p>Ежедневно находит новые видео, создаёт по одной публикации на видео и распределяет их по окну 15:00–23:00 МСК.</p>
          </div>
        </section>

        <section className="factory-panel">
          <h2>Provider status</h2>
          <div className="factory-grid-cards">
            <div className="factory-stat-card"><span>Downloader</span><strong style={{ fontSize: 20 }}>{downloader?.provider || "vkvideodownload"}</strong></div>
            <div className="factory-stat-card"><span>Скачивание</span><strong style={{ fontSize: 20 }}>vkvideodownload.com</strong></div>
            <div className="factory-stat-card"><span>Listing</span><strong style={{ fontSize: 18 }}>{listing?.playwright ? "Playwright browser + cookies" : vkCookies?.enabled ? "VK cookies + HTML parser" : "public VK/VKVideo HTML parser"}</strong></div>
            <div className="factory-stat-card"><span>VK cookies</span><strong style={{ fontSize: 24 }}>{vkCookies?.enabled ? "ON" : "OFF"}</strong><small>{vkCookies?.enabled ? `${vkCookies.cookieCount} cookies · ${vkCookies.domains.join(", ")}` : "без авторизации"}</small></div>
            <div className="factory-stat-card"><span>Timezone</span><strong style={{ fontSize: 20 }}>Europe/Moscow</strong></div>
            <div className="factory-stat-card"><span>Качество</span><strong style={{ fontSize: 24 }}>{downloader?.preferredQuality || "720p"}</strong></div>
            <div className="factory-stat-card"><span>yt-dlp fallback</span><strong style={{ fontSize: 24 }}>{downloader?.allowYtDlpFallback ? "ON" : "OFF"}</strong></div>
            <div className="factory-stat-card"><span>Playwright listing</span><strong style={{ fontSize: 24 }}>{listing?.playwright ? "ON" : "OFF"}</strong><small>{listing?.playwright ? `${listing.scrollPages} scroll · ${listing.waitMs}ms` : "браузерный режим выключен"}</small></div>
          </div>
        </section>

        <section className="factory-panel">
          <h2>Добавить источник</h2>
          <p className="muted">Лучше отправлять раздел видео: https://vkvideo.ru/@kinobro, https://vk.com/video/@kinobro или https://vk.com/videos-123456789.</p>
          <form className="inline-actions" onSubmit={add}>
            <input required type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://vkvideo.ru/@kinobro" />
            <button disabled={busy === "add"}>Добавить</button>
          </form>
          {message && <p className={message.includes("Ошибка") || message.includes("не ") ? "factory-error-text" : "factory-success-text"}>{message}</p>}
        </section>

        <section className="factory-panel">
          <h2>Источники</h2>
          {!sources.length ? (
            <div className="empty-state"><strong>Источников пока нет</strong><span>Добавьте VK-группу или VK Video канал.</span></div>
          ) : (
            <div className="factory-table-wrap">
              <table className="factory-table">
                <thead><tr><th>Источник</th><th>Настройки</th><th>Состояние</th><th>Проверка</th><th>Действия</th></tr></thead>
                <tbody>
                  {sources.map((source) => {
                    const check = checks[source.id];
                    return (
                      <tr key={source.id}>
                        <td><strong>{source.sourceTitle || source.sourceUrl}</strong><small>{source._count.videos} сохранённых видео</small></td>
                        <td>{source.dailyLimit} в день<br />{source.publishStartHour}:00–{source.publishEndHour}:00 МСК<br /><small>{timezoneLabel(source.timezone)}</small></td>
                        <td><span className={source.isEnabled ? "factory-status-ok" : "factory-status-warn"}>{source.isEnabled ? "Включён" : "Пауза"}</span><br /><small>{source.lastRunAt ? `Запуск: ${new Date(source.lastRunAt).toLocaleString("ru-RU", { timeZone: normalizeTimezone(source.timezone) })}` : "Ещё не запускался"}</small>{source.lastError && <p className="factory-error-text">{source.lastError}</p>}</td>
                        <td>
                          {check ? (
                            <div>
                              <strong>{check.ok ? `Найдено: ${check.foundCount}` : "Не прочиталось"}</strong>
                              {!check.ok && <p className="factory-error-text">Проверь VK cookies, включи VK_LISTING_ENABLE_PLAYWRIGHT=true или попробуй vk.com/videos-...</p>}
                              {!!check.videos?.length && <small>{check.videos.slice(0, 2).map((video) => video.title || video.videoUrl).join(" · ")}</small>}
                            </div>
                          ) : <small>Не проверялось</small>}
                        </td>
                        <td>
                          <div className="factory-row-actions">
                            <button disabled={busy === source.id} onClick={() => action(source.id, "RUN")}>Запустить</button>
                            <button className="secondary-button" disabled={busy === `check:${source.id}`} onClick={() => checkSource(source.id)}>Проверить список</button>
                            <button className="secondary-button" disabled={busy === source.id} onClick={() => configure(source)}>Настроить</button>
                            <button className="secondary-button" disabled={busy === source.id} onClick={() => action(source.id, "PATCH", { isEnabled: !source.isEnabled })}>{source.isEnabled ? "Пауза" : "Включить"}</button>
                            <button className="secondary-button" disabled={busy === source.id} onClick={() => action(source.id, "DELETE")}>Удалить</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
>>>>>>> ffda38c13fc565af37b0c9e48986d7703a2a34d7
  );
}
