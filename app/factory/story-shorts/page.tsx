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
type StoryDonor = {
  id: string;
  channelId: string;
  channelTitle: string;
  sourceUrl: string;
  subscriberCount: string;
  videoCount: string;
  isActive: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
};

type PageData = {
  accounts: Account[];
  donors: StoryDonor[];
  candidates: Candidate[];
  musicSummary: MusicSummary[];
  viralBrain?: {
    formulasCount: number;
    referencesCount: number;
    topStoryTypes: Array<{ name: string; count: number }>;
    topHookTypes: Array<{ name: string; count: number }>;
    topMusicMoods: Array<{ name: string; count: number }>;
    promptContext: string | null;
  };
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
  BULLIED_BACON: "Bullied Bacon",
  SAVE_MOM_OR_MONEY: "Save mom or money",
  CHOICE_PUNISHMENT: "Choice / Punishment",
  REVENGE: "Revenge",
  GIFT_BETRAYAL: "Gift / Betrayal",
  HORROR_ESCAPE: "Horror Escape",
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
  scary: "Scary",
  victory: "Victory",
  fail: "Fail",
  chase: "Chase",
  chill: "Chill",
  explaining: "Explaining",
  finale: "Finale",
  happy: "Happy",
  hype: "Hype",
  intense: "Intense",
  other: "Other",
  random: "Random",
  riser: "Riser",
  sneaky: "Sneaky",
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
  const [durationPreset, setDurationPreset] = useState("15-25");
  const [minSeconds, setMinSeconds] = useState(15);
  const [maxSeconds, setMaxSeconds] = useState(25);
  const [sourceVolume, setSourceVolume] = useState(10);
  const [useEmojis, setUseEmojis] = useState(true);
  const [windowStart, setWindowStart] = useState("15:00");
  const [windowEnd, setWindowEnd] = useState("19:00");
  const [intervalMin, setIntervalMin] = useState(20);
  const [intervalMax, setIntervalMax] = useState(30);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [donorUrl, setDonorUrl] = useState("");
  const [donorLoading, setDonorLoading] = useState(false);

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

  function applyDurationPreset(value: string) {
    setDurationPreset(value);

    if (value === "15-25") {
      setMinSeconds(15);
      setMaxSeconds(25);
      return;
    }

    if (value === "25-35") {
      setMinSeconds(25);
      setMaxSeconds(35);
      return;
    }

    if (value === "35-45") {
      setMinSeconds(35);
      setMaxSeconds(45);
      return;
    }
  }

  async function addDonor() {
    if (!donorUrl.trim()) {
      setMessage("Вставь ссылку на Story donor");
      return;
    }

    setDonorLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/factory/story-shorts/donors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl: donorUrl }),
      });
      const json = await response.json();

      if (!response.ok) throw new Error(json.error ?? "Не получилось добавить Story donor");

      setDonorUrl("");
      setMessage(json.message ?? "Story donor добавлен");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не получилось добавить Story donor");
    } finally {
      setDonorLoading(false);
    }
  }

  async function checkDonors() {
    setDonorLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/factory/story-shorts/donors/check", { method: "POST" });
      const json = await response.json();

      if (!response.ok) throw new Error(json.error ?? "Не получилось проверить Story donors");

      setMessage(`Story donors проверены: ${json.checked ?? 0}, ошибок: ${json.errors?.length ?? 0}`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не получилось проверить Story donors");
    } finally {
      setDonorLoading(false);
    }
  }

  async function disableDonor(id: string) {
    setDonorLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/factory/story-shorts/donors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await response.json();

      if (!response.ok) throw new Error(json.error ?? "Не получилось выключить Story donor");

      setMessage(json.message ?? "Story donor выключен");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не получилось выключить Story donor");
    } finally {
      setDonorLoading(false);
    }
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
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/super-upload">СУПЕР ЗАЛИВ</Link>
          <Link href="/factory/viral-lab">Вирусная лаборатория</Link>
          <Link href="/factory/story-shorts">Story Shorts</Link>
          <Link href="/factory/music">Музыка</Link>
          <Link href="/factory/long-video">Видео 16:9</Link>
          <Link href="/factory/analytics">Аналитика</Link>
          <Link href="/factory/assets">Видео персонажей</Link>
          <Link href="/factory/templates">Шаблоны</Link>
          <Link href="/factory/thumbnails">Превью</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

      <section className="factory-panel factory-panel-wide">
        <div className="factory-eyebrow">ROBLOX STORY SHORTS</div>
        <h1>Простые вирусные Roblox Shorts без Amelia</h1>
        <p className="factory-muted">
          AI ищет story-моменты в длинных 16:9 донорах, держит выбранный тобой диапазон длины, пишет крупный текст, эмодзи, выбирает музыку и публикует в выбранное окно New York.
        </p>
        <div className="factory-row-actions">
          <Link href="/factory/viral-lab">Вирусная лаборатория</Link>
          <Link href="/factory/super-upload">СУПЕР ЗАЛИВ / Amelia</Link>
          <Link href="/factory/music">Музыка по темам</Link>
          <Link href="/factory">Задачи</Link>
        </div>
      </section>

      <section className="factory-panel factory-panel-wide">
        <div className="factory-row-between">
          <div>
            <div className="factory-eyebrow">VIRAL LAB BRAIN</div>
            <h2>Подключенные формулы</h2>
            <p className="factory-muted">
              Story Shorts теперь берет накопленные формулы из Вирусной лаборатории и подбирает их под донорское видео.
            </p>
          </div>
          <Link className="factory-secondary-button" href="/factory/viral-lab">Открыть лабораторию</Link>
        </div>
        <div className="analytics-summary-grid viral-summary-grid">
          <div className="factory-stat-card"><strong>{data?.viralBrain?.referencesCount ?? 0}</strong><span>референсов изучено</span></div>
          <div className="factory-stat-card"><strong>{data?.viralBrain?.formulasCount ?? 0}</strong><span>формул активно</span></div>
          <div className="factory-stat-card"><strong>{data?.viralBrain?.topStoryTypes?.[0]?.name ?? "AUTO"}</strong><span>топ story type</span></div>
          <div className="factory-stat-card"><strong>{data?.viralBrain?.topMusicMoods?.[0]?.name ?? "AUTO"}</strong><span>топ музыка</span></div>
        </div>
      </section>

      <section className="factory-panel factory-panel-wide">
        <div className="factory-row-between">
          <div>
            <div className="factory-eyebrow">STORY DONORS</div>
            <h2>Отдельные доноры для Roblox Story Shorts</h2>
            <p className="factory-muted">
              Это отдельный список каналов. Он не смешивается с донорами из СУПЕР ЗАЛИВА для Amelia Reaction.
            </p>
          </div>
          <button type="button" className="factory-secondary-button" disabled={donorLoading} onClick={checkDonors}>
            Проверить Story donors
          </button>
        </div>
        <div className="factory-inline-form">
          <input
            value={donorUrl}
            onChange={(event) => setDonorUrl(event.target.value)}
            placeholder="https://www.youtube.com/@storydonor или ссылка на видео"
          />
          <button type="button" className="factory-secondary-button" disabled={donorLoading} onClick={addDonor}>
            + Добавить Story donor
          </button>
        </div>
        <div className="factory-grid-cards factory-grid-cards-small">
          {(data?.donors ?? []).map((donor) => (
            <article className="factory-card" key={donor.id}>
              <h3>{donor.channelTitle}</h3>
              <p>{formatNumber(Number(donor.subscriberCount))} subs · {formatNumber(Number(donor.videoCount))} videos</p>
              <p className="factory-muted">
                {donor.lastCheckedAt ? `check: ${new Date(donor.lastCheckedAt).toLocaleString("ru-RU")}` : "еще не проверялся"}
              </p>
              {donor.lastError ? <p className="factory-error-text">{donor.lastError}</p> : null}
              <button type="button" className="factory-secondary-button" disabled={donorLoading || !donor.isActive} onClick={() => disableDonor(donor.id)}>
                {donor.isActive ? "Выключить" : "Выключен"}
              </button>
            </article>
          ))}
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
            Длина ролика
            <select value={durationPreset} onChange={(event) => applyDurationPreset(event.target.value)}>
              <option value="15-25">15–25 сек — быстрый тест</option>
              <option value="25-35">25–35 сек — средний</option>
              <option value="35-45">35–45 сек — длиннее</option>
              <option value="custom">Своя длина</option>
            </select>
          </label>
          <label>
            Минимум секунд
            <input type="number" min={10} max={55} value={minSeconds} onChange={(event) => { setDurationPreset("custom"); setMinSeconds(Number(event.target.value)); }} />
          </label>
          <label>
            Максимум секунд
            <input type="number" min={10} max={60} value={maxSeconds} onChange={(event) => { setDurationPreset("custom"); setMaxSeconds(Number(event.target.value)); }} />
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
          <strong>Длина под твоим контролем:</strong> выбери пресет или свою вилку. AI подбирает точную длительность под момент, но не выходит за границы {minSeconds}–{maxSeconds} сек.
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
