"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FactoryJob = {
  id: string;
  sourceUrl: string;
  clipSeconds: number;
  titlePrefix: string;
  platforms: string[];
  status: string;
  error: string | null;
  totalClips: number;
  createdAt: string;
  clips: {
    id: string;
    index: number;
    title: string;
    filePath: string | null;
    publishes: {
      id: string;
      platform: string;
      status: string;
      platformUrl: string | null;
      error: string | null;
    }[];
  }[];
};

export default function FactoryPage() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [clipSeconds, setClipSeconds] = useState("45");
  const [titlePrefix, setTitlePrefix] = useState("Lana watches games");
  const [publishYoutube, setPublishYoutube] = useState(true);
  const [publishTikTok, setPublishTikTok] = useState(false);
  const [jobs, setJobs] = useState<FactoryJob[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  async function loadJobs() {
    const response = await fetch("/api/factory/jobs", {
      cache: "no-store",
    });

    const data = (await response.json()) as {
      jobs: FactoryJob[];
    };

    setJobs(data.jobs);
  }

  useEffect(() => {
    loadJobs();

    const timer = window.setInterval(() => {
      loadJobs();
    }, 4000);

    return () => window.clearInterval(timer);
  }, []);

  async function createJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsCreating(true);
    setError("");

    try {
      const platforms: string[] = [];

      if (publishYoutube) platforms.push("YOUTUBE");
      if (publishTikTok) platforms.push("TIKTOK");

      const response = await fetch("/api/factory/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sourceUrl,
          clipSeconds: Number(clipSeconds),
          titlePrefix,
          platforms,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Не получилось создать задачу");
      }

      setSourceUrl("");
      await loadJobs();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не получилось создать задачу",
      );
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="page">
      <div className="shell">
        <nav className="nav">
          <Link href="/factory">Завод</Link>
          <Link href="/factory/assets">Видео Ланы</Link>
          <Link href="/factory/accounts">Аккаунты</Link>
        </nav>

        <section className="card">
          <h1>Lana Content Factory</h1>
          <p>
            Вставляешь YouTube-ссылку. Worker сам качает исходник во временную
            папку, режет его на короткие клипы, накладывает видео Ланы и
            публикует.
          </p>

          <form className="grid" onSubmit={createJob}>
            <label>
              YouTube URL
              <input
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                required
              />
            </label>

            <div className="grid grid-2">
              <label>
                Длина клипа
                <select
                  value={clipSeconds}
                  onChange={(event) => setClipSeconds(event.target.value)}
                >
                  <option value="30">30 секунд</option>
                  <option value="45">45 секунд</option>
                  <option value="60">60 секунд</option>
                </select>
              </label>

              <label>
                Заголовок
                <input
                  value={titlePrefix}
                  onChange={(event) => setTitlePrefix(event.target.value)}
                  placeholder="Lana watches games"
                  required
                />
              </label>
            </div>

            <div className="grid grid-2">
              <label>
                <span>YouTube</span>
                <select
                  value={publishYoutube ? "yes" : "no"}
                  onChange={(event) =>
                    setPublishYoutube(event.target.value === "yes")
                  }
                >
                  <option value="yes">Заливать</option>
                  <option value="no">Не заливать</option>
                </select>
              </label>

              <label>
                <span>TikTok</span>
                <select
                  value={publishTikTok ? "yes" : "no"}
                  onChange={(event) =>
                    setPublishTikTok(event.target.value === "yes")
                  }
                >
                  <option value="no">Пока выключено</option>
                  <option value="yes">Создать publish-задачи</option>
                </select>
              </label>
            </div>

            {error ? <p className="error">{error}</p> : null}

            <button disabled={isCreating}>
              {isCreating ? "Создаю задачу..." : "Generate & Publish"}
            </button>
          </form>
        </section>

        <section style={{ height: 24 }} />

        <section className="card">
          <h2>Задачи</h2>

          <table className="table">
            <thead>
              <tr>
                <th>Статус</th>
                <th>URL</th>
                <th>Клипы</th>
                <th>Публикации</th>
              </tr>
            </thead>

            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <span className="badge">{job.status}</span>
                    {job.error ? <p className="error">{job.error}</p> : null}
                  </td>

                  <td>
                    <div style={{ maxWidth: 360, wordBreak: "break-all" }}>
                      {job.sourceUrl}
                    </div>
                    <p className="muted">
                      {job.clipSeconds} сек · {job.platforms.join(", ")}
                    </p>
                  </td>

                  <td>
                    {job.clips.length} / {job.totalClips}
                  </td>

                  <td>
                    {job.clips.flatMap((clip) =>
                      clip.publishes.map((publish) => (
                        <div key={publish.id}>
                          <b>
                            {clip.index}. {publish.platform}
                          </b>{" "}
                          <span className="badge">{publish.status}</span>
                          {publish.platformUrl ? (
                            <>
                              {" "}
                              <a
                                className="success"
                                href={publish.platformUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                открыть
                              </a>
                            </>
                          ) : null}
                          {publish.error ? (
                            <p className="error">{publish.error}</p>
                          ) : null}
                        </div>
                      )),
                    )}
                  </td>
                </tr>
              ))}

              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    Пока задач нет.
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
