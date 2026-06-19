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

const DEFAULT_AUTO_SOURCE_TIMEZONE = "Europe/Moscow";

function normalizeTimezone(timezone: string) {
  return timezone === "Europe/Moscow" ? DEFAULT_AUTO_SOURCE_TIMEZONE : timezone;
}

function timezoneLabel(timezone: string) {
  const normalized = normalizeTimezone(timezone);
  return normalized === DEFAULT_AUTO_SOURCE_TIMEZONE ? "РњРЎРљ (Europe/Moscow)" : normalized;
}

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ РёСЃС‚РѕС‡РЅРёРє");
      setSourceUrl(""); setMessage("РСЃС‚РѕС‡РЅРёРє РґРѕР±Р°РІР»РµРЅ"); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "РћС€РёР±РєР°"); }
    finally { setBusy(null); }
  }

  async function action(id: string, method: "PATCH" | "DELETE" | "RUN", body?: object) {
    setBusy(id); setMessage("");
    try {
      const url = method === "RUN" ? `/api/factory/auto-sources/${id}/run-now` : `/api/factory/auto-sources/${id}`;
      const response = await fetch(url, { method: method === "RUN" ? "POST" : method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "РћРїРµСЂР°С†РёСЏ РЅРµ РІС‹РїРѕР»РЅРµРЅР°");
      setMessage(method === "RUN" ? "РђРІС‚РѕР·Р°Р±РѕСЂ Р·Р°РїСѓС‰РµРЅ" : "РЎРѕС…СЂР°РЅРµРЅРѕ"); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "РћС€РёР±РєР°"); }
    finally { setBusy(null); }
  }

  function configure(source: Source) {
    const dailyLimit = Number(window.prompt("Р’РёРґРµРѕ РІ РґРµРЅСЊ (1вЂ“20)", String(source.dailyLimit)));
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 20) return;
    const publishStartHour = Number(window.prompt("РќР°С‡Р°Р»Рѕ РѕРєРЅР° (0вЂ“23)", String(source.publishStartHour)));
    const publishEndHour = Number(window.prompt("РљРѕРЅРµС† РѕРєРЅР° (1вЂ“24)", String(source.publishEndHour)));
    const timezone = window.prompt("Р§Р°СЃРѕРІРѕР№ РїРѕСЏСЃ IANA (РњРЎРљ = Europe/Moscow)", normalizeTimezone(source.timezone))?.trim();
    if (!timezone || publishEndHour <= publishStartHour) return;
    void action(source.id, "PATCH", { dailyLimit, publishStartHour, publishEndHour, timezone });
  }

  return (
    <main className="page"><div className="shell">
      <nav className="nav"><Link href="/factory">Р—Р°РІРѕРґ</Link><Link href="/factory/super-upload">РЎСѓРїРµСЂ Р·Р°Р»РёРІ</Link><Link href="/factory/auto-sources">VK Р°РІС‚РѕР·Р°Р±РѕСЂ</Link><Link href="/factory/accounts">РђРєРєР°СѓРЅС‚С‹</Link></nav>
      <section className="factory-hero-card"><div><p className="factory-eyebrow">Content Factory</p><h1>VK Р°РІС‚РѕР·Р°Р±РѕСЂ</h1><p>Р•Р¶РµРґРЅРµРІРЅРѕ РЅР°С…РѕРґРёС‚ РЅРѕРІС‹Рµ РІРёРґРµРѕ, СЃРѕР·РґР°С‘С‚ РїРѕ РѕРґРЅРѕР№ РїСѓР±Р»РёРєР°С†РёРё РЅР° РІРёРґРµРѕ Рё СЂР°СЃРїСЂРµРґРµР»СЏРµС‚ РёС… РїРѕ РѕРєРЅСѓ.</p></div></section>
      <section className="factory-panel"><h2>Downloader</h2><div className="factory-grid-cards"><div className="factory-stat-card"><span>Provider</span><strong style={{ fontSize: 20 }}>{downloader?.provider || "vkvideodownload"}</strong></div><div className="factory-stat-card"><span>РћСЃРЅРѕРІРЅРѕР№ СЃРµСЂРІРёСЃ</span><strong style={{ fontSize: 20 }}>vkvideodownload.com</strong></div><div className="factory-stat-card"><span>РљР°С‡РµСЃС‚РІРѕ</span><strong style={{ fontSize: 24 }}>{downloader?.preferredQuality || "720p"}</strong></div><div className="factory-stat-card"><span>yt-dlp fallback</span><strong style={{ fontSize: 24 }}>{downloader?.allowYtDlpFallback ? "ON" : "OFF"}</strong></div></div></section>
      <section className="factory-panel">
        <h2>Р”РѕР±Р°РІРёС‚СЊ РёСЃС‚РѕС‡РЅРёРє</h2>
        <form className="inline-actions" onSubmit={add}><input required type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://vk.com/videos-123456789"/><button disabled={busy === "add"}>Р”РѕР±Р°РІРёС‚СЊ</button></form>
        {message && <p className={message.includes("РћС€РёР±РєР°") || message.includes("РЅРµ ") ? "factory-error-text" : "factory-success-text"}>{message}</p>}
      </section>
      <section className="factory-panel"><h2>РСЃС‚РѕС‡РЅРёРєРё</h2>
        {!sources.length ? <div className="empty-state"><strong>РСЃС‚РѕС‡РЅРёРєРѕРІ РїРѕРєР° РЅРµС‚</strong><span>Р”РѕР±Р°РІСЊС‚Рµ VK-РіСЂСѓРїРїСѓ РёР»Рё VK Video РєР°РЅР°Р».</span></div> :
          <div className="factory-table-wrap"><table className="factory-table"><thead><tr><th>РСЃС‚РѕС‡РЅРёРє</th><th>РќР°СЃС‚СЂРѕР№РєРё</th><th>РЎРѕСЃС‚РѕСЏРЅРёРµ</th><th>Р”РµР№СЃС‚РІРёСЏ</th></tr></thead><tbody>
            {sources.map((source) => <tr key={source.id}>
              <td><strong>{source.sourceTitle || source.sourceUrl}</strong><small>{source._count.videos} СЃРѕС…СЂР°РЅС‘РЅРЅС‹С… РІРёРґРµРѕ</small></td>
              <td>{source.dailyLimit} РІ РґРµРЅСЊ<br/>{source.publishStartHour}:00вЂ“{source.publishEndHour}:00 РњРЎРљ<br/><small>{timezoneLabel(source.timezone)}</small></td>
              <td><span className={source.isEnabled ? "factory-status-ok" : "factory-status-warn"}>{source.isEnabled ? "Р’РєР»СЋС‡С‘РЅ" : "РџР°СѓР·Р°"}</span><br/><small>{source.lastRunAt ? `Р—Р°РїСѓСЃРє: ${new Date(source.lastRunAt).toLocaleString("ru-RU", { timeZone: normalizeTimezone(source.timezone) })}` : "Р•С‰С‘ РЅРµ Р·Р°РїСѓСЃРєР°Р»СЃСЏ"}</small>{source.lastError && <p className="factory-error-text">{source.lastError}</p>}</td>
              <td><div className="factory-row-actions"><button disabled={busy === source.id} onClick={() => action(source.id, "RUN")}>Р—Р°РїСѓСЃС‚РёС‚СЊ</button><button className="secondary-button" disabled={busy === source.id} onClick={() => configure(source)}>РќР°СЃС‚СЂРѕРёС‚СЊ</button><button className="secondary-button" disabled={busy === source.id} onClick={() => action(source.id, "PATCH", { isEnabled: !source.isEnabled })}>{source.isEnabled ? "РџР°СѓР·Р°" : "Р’РєР»СЋС‡РёС‚СЊ"}</button><button className="secondary-button" disabled={busy === source.id} onClick={() => action(source.id, "DELETE")}>РЈРґР°Р»РёС‚СЊ</button></div></td>
            </tr>)}</tbody></table></div>}
      </section>
    </div></main>
  );
}
