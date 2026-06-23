import { prisma } from "../../../lib/prisma";

function formatDate(value?: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

export default async function InstagramSourcesPage() {
  const sources = await prisma.factoryInstagramAutoSource.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { videos: true } },
    },
  });

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Instagram Auto Sources</h1>
      <p>
        Добавляй публичные Instagram-аккаунты. Worker каждый день берёт 10 разных Reels суммарно.
        При ручном запуске можно выбрать окно публикации: с текущего времени до нужного часа по МСК.
        Description берётся из Instagram, а первой строкой всегда ставится: переходи смотреть на REDFILM.
      </p>

      <section style={{ marginTop: 24, padding: 16, border: "1px solid #333", borderRadius: 12 }}>
        <h2>Как добавить</h2>
        <p>Через Telegram просто отправь одну или несколько ссылок:</p>
        <pre>https://www.instagram.com/account1/{"\n"}https://www.instagram.com/account2/</pre>
        <p>Команды: /instagram_sources, /instagram_run_today, /instagram_run_today 23, /instagram_status, /instagram_pause, /instagram_resume</p>
        <p>Для ручного запуска в Telegram бот покажет кнопки: сейчас → 18:00 / 20:00 / 23:00 / 00:00 / 03:00 МСК.</p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Источники</h2>
        {sources.length === 0 ? (
          <p>Источников пока нет.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {sources.map((source) => (
              <article key={source.id} style={{ padding: 16, border: "1px solid #333", borderRadius: 12 }}>
                <strong>{source.sourceTitle || source.username || source.sourceUrl}</strong>
                <div>{source.sourceUrl}</div>
                <div>{source.isEnabled ? "🟢 активно" : "⏸ пауза"}</div>
                <div>Видео в базе: {source._count.videos}</div>
                <div>Последний запуск: {formatDate(source.lastRunAt)}</div>
                {source.lastError ? <div style={{ color: "#f66" }}>Ошибка: {source.lastError}</div> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
