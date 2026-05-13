"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Account = { id: string; name: string; platform: "YOUTUBE" | "TIKTOK" };
type Candidate = {
  id: string;
  title: string;
  sourceUrl: string;
  channelTitle: string | null;
  views: number;
  viewsPerDay: number;
  viralChance: number;
  isUsed: boolean;
};
type MusicSummary = { mood: string; count: number };

type PageData = {
  accounts: Account[];
  candidates: Candidate[];
  musicSummary: MusicSummary[];
  storyStyles: string[];
  musicMoods: string[];
};

const styleLabels: Record<string, string> = {
  AUTO: "Auto — AI сам выберет",
  LOVE_MONEY: "Love or Money",
  GIFT_CHOICE: "Gift / Choice",
  SYSTEM_MESSAGE: "System Message",
  POOR_RICH: "Poor vs Rich",
  GOOD_EVIL: "Good vs Evil",
  HORROR_WARNING: "Horror / Warning",
  BULLYING_REVENGE: "Bullying / Revenge",
  FUNNY_FAIL: "Funny Fail",
  SAVE_SOMEONE: "Who would you save",
  YEAR_COMPARISON: "2024 / 2025",
};

const moodLabels: Record<string, string> = {
  AUTO: "Auto by AI",
  sad: "Sad",
  emotional: "Emotional",
  suspense: "Suspense",
  horror: "Horror",
  funny: "Funny",
  chaos: "Chaos",
  epic: "Epic",
  cute: "Cute",
  magical: "Magical",
  gift: "Gift",
  choice: "Choice",
  rich: "Rich",
  poor: "Poor",
  love: "Love",
  bullying: "Bullying",
  revenge: "Revenge",
  system: "System",
  mystery: "Mystery",
  surprise: "Surprise",
  dramatic: "Dramatic",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

export default function StoryShortsPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [accountId, setAccountId] = useState("");
  const [count, setCount] = useState(10);
  const [storyStyle, setStoryStyle] = useState("AUTO");
  const [musicMood, setMusicMood] = useState("AUTO");
  const [minSeconds, setMinSeconds] = useState(10);
  const [maxSeconds, setMaxSeconds] = useState(35);
  const [sourceVolume, setSourceVolume] = useState(10);
  const [useEmojis, setUseEmojis] = useState(true);
  const [windowStart, setWindowStart] = useState("21:30");
  const [windowEnd, setWindowEnd] = useState("23:45");
  const [intervalMin, setIntervalMin] = useState(20);
  const [intervalMax, setIntervalMax] = useState(30);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/factory/story-shorts", { cache: "no-store" });
    const json = await response.json();
    setData(json);
    if (!accountId && json.accounts?.[0]?.id) setAccountId(json.accounts[0].id);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error instanceof Error ? error.message : "Ошибка"));
  }, []);

  const musicMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data?.musicSummary ?? []) map.set(item.mood, item.count);
    return map;
  }, [data]);

  function parseTime(value: string) {
    const [hour, minute] = value.split(":").map((item) => Number(item));
    return {
      hour: Number.isFinite(hour) ? hour : 21,
      minute: Number.isFinite(minute) ? minute : 30,
    };
  }

  async function createPackage() {
    setLoading(true);
    setMessage(null);

    try {
      const start = parseTime(windowStart);
      const end = parseTime(windowEnd);
      const response = await fetch("/api/factory/story-shorts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          candidatesCount: count,
          storyStyle,
          storyMinSeconds: minSeconds,
          storyMaxSeconds: maxSeconds,
          storyMusicMood: musicMood,
          storySourceVolume: sourceVolume,
          storyUseEmojis: useEmojis,
          intervalMin,
          intervalMax,
          windowStartHour: start.hour,
          windowStartMinute: start.minute,
          windowEndHour: end.hour,
          windowEndMinute: end.minute,
          fitInsideWindow: true,
        }),
      });
      const json = await response.json();

      if (!response.ok) throw new Error(json.error ?? "Ошибка создания");

      setMessage(json.message ?? "Пакет создан");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка создания");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="factory-shell">
      <section className="factory-panel factory-panel-wide">
        <div className="factory-eyebrow">ROBLOX STORY SHORTS</div>
        <h1>Простые вирусные Roblox Shorts без Amelia</h1>
        <p className="factory-muted">
          AI сам ищет story-моменты в длинных 16:9 донорах, сам выбирает длину 10–35 сек, пишет крупный текст, эмодзи, выбирает музыку и публикует в выбранное окно New York.
        </p>
        <div className="factory-row-actions">
          <Link href="/factory/super-upload">Горячие доноры</Link>
          <Link href="/factory/music">Музыка по темам</Link>
          <Link href="/factory">Задачи</Link>
        </div>
      </section>

      <section className="factory-panel factory-panel-wide">
        <h2>Настройки пакета</h2>
        <div className="factory-form-grid">
          <label>
            YouTube-аккаунт
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {(data?.accounts ?? []).map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <label>
            Количество роликов
            <input type="number" min={1} max={50} value={count} onChange={(event) => setCount(Number(event.target.value))} />
          </label>
          <label>
            Story style
            <select value={storyStyle} onChange={(event) => setStoryStyle(event.target.value)}>
              {(data?.storyStyles ?? ["AUTO"]).map((item) => (
                <option key={item} value={item}>{styleLabels[item] ?? item}</option>
              ))}
            </select>
          </label>
          <label>
            Музыка
            <select value={musicMood} onChange={(event) => setMusicMood(event.target.value)}>
              {(data?.musicMoods ?? ["AUTO"]).map((item) => (
                <option key={item} value={item}>{moodLabels[item] ?? item}{item !== "AUTO" ? ` · ${musicMap.get(item) ?? 0}` : ""}</option>
              ))}
            </select>
          </label>
          <label>
            Минимум секунд
            <input type="number" min={10} max={30} value={minSeconds} onChange={(event) => setMinSeconds(Number(event.target.value))} />
          </label>
          <label>
            Максимум секунд
            <input type="number" min={10} max={35} value={maxSeconds} onChange={(event) => setMaxSeconds(Number(event.target.value))} />
          </label>
          <label>
            Звук исходника, %
            <input type="number" min={0} max={50} value={sourceVolume} onChange={(event) => setSourceVolume(Number(event.target.value))} />
          </label>
          <label>
            Эмодзи
            <select value={useEmojis ? "yes" : "no"} onChange={(event) => setUseEmojis(event.target.value === "yes")}>
              <option value="yes">Включить</option>
              <option value="no">Выключить</option>
            </select>
          </label>
          <label>
            Окно NY — начало
            <input type="time" value={windowStart} onChange={(event) => setWindowStart(event.target.value)} />
          </label>
          <label>
            Окно NY — конец
            <input type="time" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} />
          </label>
          <label>
            Интервал мин
            <input type="number" min={5} max={180} value={intervalMin} onChange={(event) => setIntervalMin(Number(event.target.value))} />
          </label>
          <label>
            Интервал макс
            <input type="number" min={5} max={240} value={intervalMax} onChange={(event) => setIntervalMax(Number(event.target.value))} />
          </label>
        </div>
        <div className="factory-blue-box">
          <strong>AI длина auto:</strong> ты не выбираешь 20/30/45 вручную. AI сам подбирает длительность под момент, но держит границы {minSeconds}–{maxSeconds} сек.
        </div>
        <button className="factory-primary-button" disabled={loading || !accountId} onClick={createPackage}>
          {loading ? "Создаю..." : "Создать Roblox Story Shorts"}
        </button>
        {message ? <p className="factory-error-text">{message}</p> : null}
      </section>

      <section className="factory-panel factory-panel-wide">
        <h2>Кандидаты от доноров</h2>
        <div className="factory-grid-cards">
          {(data?.candidates ?? []).map((candidate, index) => (
            <article className="factory-card" key={candidate.id}>
              <div className="factory-eyebrow">#{index + 1} · {candidate.viralChance}/100</div>
              <h3>{candidate.title}</h3>
              <p>{candidate.channelTitle ?? "Без канала"}</p>
              <p className="factory-muted">{formatNumber(candidate.views)} views · {formatNumber(candidate.viewsPerDay)} views/day</p>
              <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">Открыть источник</a>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
