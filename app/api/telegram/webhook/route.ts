import { NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import { FACTORY_CONFIG } from "../../../../lib/factory/factory-config";
import {
  addInstagramAutoSource,
  checkInstagramAutoSource,
  extractInstagramSourcesFromText,
  formatInstagramPublishWindowLabel,
  getInstagramSourceUsageStats,
  humanizeInstagramAutoSourceError,
  listInstagramAutoSources,
  normalizeInstagramPublishEndHour,
  runInstagramAutoSourcesDaily,
  setInstagramSourcesActive,
} from "../../../../lib/factory/instagram-auto-source";
import { saveInstagramCookiesText } from "../../../../lib/factory/instagram-secrets";
import {
  answerCallbackQuery,
  editTelegramMessage,
  readTelegramFileText,
  sendTelegramMessage,
  upsertTelegramChat,
  type TelegramReplyMarkup,
} from "../../../../lib/factory/telegram";

export const runtime = "nodejs";

type TelegramUser = { username?: string; first_name?: string };
type TelegramDocument = { file_id: string; file_name?: string; mime_type?: string };
type TelegramUpdate = {
  message?: { message_id: number; text?: string; document?: TelegramDocument; chat: { id: number }; from?: TelegramUser };
  callback_query?: {
    id: string;
    data?: string;
    from?: TelegramUser;
    message?: { message_id: number; chat: { id: number } };
  };
};

function configuredSecretIsValid(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  const url = new URL(request.url);
  return url.searchParams.get("secret") === expected || request.headers.get("x-telegram-bot-api-secret-token") === expected;
}

function allowedChatIds() {
  return (process.env.TELEGRAM_ALLOWED_CHAT_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function appUrl(path = "/factory/instagram-sources") {
  const base = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}${path}` : null;
}

function denied(chatId: string | number) {
  return sendTelegramMessage(chatId, `⛔ Доступ не выдан. Ваш chatId: ${chatId}`);
}

function mainMenuText() {
  return `🎬 REDFILM Instagram Auto Sources\n\nОтправь ссылки на публичные Instagram-аккаунты — можно сразу несколько. При добавлении я сразу пробую просканировать профиль и показать, сколько Reels найдено и сколько осталось в запасе.\n\nКаждый день беру новые Reels, не повторяюсь и ставлю ролики в очередь. При ручном запуске ты выбираешь окно публикации: с текущего времени до выбранного часа по МСК.\n\nDescription:\nпервая строка всегда: переходи смотреть на REDFILM\nдальше оригинальное описание из Instagram.\n\nКоманды:\n/menu — меню\n/instagram_sources — источники и запас роликов\n/instagram_deep_scan — глубокий скан до 1000 публикаций\n/instagram_run_today — выбрать окно и запустить сегодня\n/instagram_run_today 23 — запустить сейчас и разложить до 23:00 МСК\n/status — последние задачи\n/queue — очередь обработки\n/set_instagram_cookies — сохранить cookies.txt Instagram\n/instagram_pause — пауза\n/instagram_resume — включить`;
}

function mainKeyboard(): TelegramReplyMarkup {
  const url = appUrl();
  return {
    inline_keyboard: [
      [
        { text: "📸 Instagram источники", callback_data: "ig:sources" },
        { text: "🔎 Досканировать", callback_data: "ig:deep_scan" },
      ],
      [
        { text: "▶️ Запуск сейчас", callback_data: "ig:run_menu" },
        { text: "🧪 Загрузить 1 видео", callback_data: "ig:test_one" },
      ],
      [
        { text: "📊 Статус", callback_data: "ig:status" },
        { text: "🛠 Очередь", callback_data: "ig:queue" },
      ],
      [
        { text: "🛑 Отменить все задачи", callback_data: "ig:cancel_all_confirm" },
      ],
      [
        { text: "⏸ Пауза", callback_data: "ig:pause" },
        { text: "▶️ Включить", callback_data: "ig:resume" },
      ],
      [url ? { text: "Открыть сайт", url } : { text: "ℹ️ Помощь", callback_data: "ig:help" }],
    ],
  };
}

function sourceKeyboard(sourceId: string): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: "🔍 Проверить", callback_data: `ig:check:${sourceId}` },
        { text: "🔎 Глубокий скан", callback_data: `ig:deep_scan_source:${sourceId}` },
      ],
      [
        { text: "▶️ Запуск сейчас", callback_data: "ig:run_menu" },
        { text: "🧪 1 видео", callback_data: "ig:test_one" },
      ],
      [
        { text: "📸 Источники", callback_data: "ig:sources" },
        { text: "🛠 Очередь", callback_data: "ig:queue" },
      ],
    ],
  };
}

function runWindowKeyboard(): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: "сейчас → 18:00 МСК", callback_data: "ig:run_until:18" },
        { text: "сейчас → 20:00 МСК", callback_data: "ig:run_until:20" },
      ],
      [
        { text: "сейчас → 23:00 МСК", callback_data: "ig:run_until:23" },
        { text: "сейчас → 00:00 МСК", callback_data: "ig:run_until:24" },
      ],
      [
        { text: "сейчас → 03:00 МСК", callback_data: "ig:run_until:3" },
        { text: "📸 Источники", callback_data: "ig:sources" },
      ],
    ],
  };
}

function runWindowText() {
  return [
    "▶️ Выбери окно публикации по МСК.",
    "",
    "Ролики будут запланированы с текущего времени до выбранного часа.",
    "Пример: сейчас → 23:00 МСК разложит 10 роликов равномерно до 23:00.",
    "",
    "Можно также написать: /instagram_run_today 23",
  ].join("\n");
}

async function executeRunToday(chatId: string | number, publishEndHourInput: number | string) {
  const publishEndHour = normalizeInstagramPublishEndHour(publishEndHourInput);
  const windowLabel = formatInstagramPublishWindowLabel(publishEndHour);
  await sendTelegramMessage(chatId, `▶️ Запускаю Instagram автозабор: ${windowLabel}...`, mainKeyboard());
  const result = await runInstagramAutoSourcesDaily({
    chatId: String(chatId),
    force: true,
    limit: 10,
    startFromNow: true,
    publishEndHour,
  });
  await sendTelegramMessage(
    chatId,
    [
      "✅ Instagram запуск завершён.",
      "",
      `Окно публикаций: ${windowLabel}`,
      `Найдено: ${result.foundCount}`,
      `Новых: ${result.newCount}`,
      `Дублей: ${result.duplicateCount}`,
      `Скачано: ${result.downloadedCount}`,
      `Создано задач: ${result.createdJobsCount}`,
      `Пропущено: ${result.skippedCount ?? 0}`,
      `Ошибок: ${result.failedCount ?? 0}`,
      result.cooldownUntil ? `Cooldown до: ${formatDate(result.cooldownUntil)}` : null,
    ].filter(Boolean).join("\n"),
    mainKeyboard(),
  );
}


async function executeDeepScan(chatId: string | number, sourceId?: string) {
  const sources = sourceId
    ? await prisma.factoryInstagramAutoSource.findMany({ where: { id: sourceId, chat: { chatId: String(chatId) } } })
    : await listInstagramAutoSources(String(chatId));

  if (sources.length === 0) {
    await sendTelegramMessage(chatId, "📸 Instagram-источников нет. Сначала отправь ссылку на профиль.", mainKeyboard());
    return;
  }

  const limit = FACTORY_CONFIG.instagramDeepScanLimit;
  await sendTelegramMessage(
    chatId,
    [
      "🔎 Запускаю глубокий скан.",
      `Источников: ${sources.length}`,
      `Лимит: до ${limit} публикаций на источник`,
      "",
      "Это может занять несколько минут. Если Instagram даст лимит — поставлю cooldown.",
    ].join("\n"),
    mainKeyboard(),
  );

  const blocks: string[] = [];
  for (const source of sources) {
    const result = await checkInstagramAutoSource(source.id, { limit });
    blocks.push(formatScanResult(source, result));
  }

  await sendTelegramMessage(chatId, blocks.join("\n\n---\n\n"), mainKeyboard());
}

function cancelAllConfirmKeyboard(): TelegramReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: "Да, отменить все", callback_data: "ig:cancel_all" },
        { text: "Нет", callback_data: "ig:menu" },
      ],
    ],
  };
}

async function executeTestOne(chatId: string | number) {
  await sendTelegramMessage(chatId, "🧪 Тестовая загрузка: ставлю в очередь только 1 Instagram-видео...", mainKeyboard());
  const result = await runInstagramAutoSourcesDaily({
    chatId: String(chatId),
    force: true,
    limit: 1,
    startFromNow: true,
    publishEndHour: 24,
  });

  await sendTelegramMessage(
    chatId,
    [
      "🧪 Тестовая загрузка завершена.",
      "",
      `Найдено: ${result.foundCount}`,
      `Новых: ${result.newCount}`,
      `Дублей/пропущенных повторов: ${result.duplicateCount}`,
      `Скачано: ${result.downloadedCount}`,
      `Создано задач: ${result.createdJobsCount}`,
      `Пропущено: ${result.skippedCount ?? 0}`,
      `Ошибок: ${result.failedCount ?? 0}`,
      result.createdJobsCount === 0 ? "Если задач 0 — нажми 🔎 Досканировать: возможно, последние Reels уже были в базе, а новые лежат глубже в профиле." : null,
      result.cooldownUntil ? `Cooldown до: ${formatDate(result.cooldownUntil)}` : null,
    ].filter(Boolean).join("\n"),
    mainKeyboard(),
  );
}

async function cancelAllInstagramTasks(chatId: string | number) {
  const jobs = await prisma.factoryJob.findMany({
    where: {
      titlePrefix: { startsWith: "INSTAGRAM:" },
      telegramJobs: { some: { chat: { chatId: String(chatId) } } },
      status: { in: ["QUEUED", "DOWNLOADING", "RENDERING", "PUBLISHING"] },
    },
    select: { id: true, status: true },
    take: 500,
  });

  const jobIds = jobs.map((job) => job.id);
  if (jobIds.length === 0) {
    return { canceledNow: 0, cancelRequested: 0 };
  }

  const queuedIds = jobs.filter((job) => job.status === "QUEUED").map((job) => job.id);
  const activeIds = jobs.filter((job) => job.status !== "QUEUED").map((job) => job.id);

  if (queuedIds.length > 0) {
    await prisma.factoryJob.updateMany({
      where: { id: { in: queuedIds } },
      data: {
        status: "CANCELED",
        cancelRequested: true,
        canceledAt: new Date(),
        progressLabel: "Задача отменена через Telegram",
      },
    });
  }

  if (activeIds.length > 0) {
    await prisma.factoryJob.updateMany({
      where: { id: { in: activeIds } },
      data: {
        cancelRequested: true,
        progressLabel: "Отмена запрошена через Telegram",
      },
    });
  }

  await prisma.factoryPublish.updateMany({
    where: { clip: { jobId: { in: jobIds } }, status: { in: ["QUEUED", "UPLOADING"] } },
    data: { status: "CANCELED", error: "Задача отменена через Telegram" },
  });

  if (queuedIds.length > 0) {
    await prisma.factoryInstagramAutoSourceVideo.updateMany({
      where: {
        source: { chat: { chatId: String(chatId) } },
        factoryJobId: { in: queuedIds },
        status: { notIn: ["PUBLISHED", "DUPLICATE"] },
      },
      data: {
        status: "NEW",
        factoryJobId: null,
        queuedAt: null,
        pickedAt: null,
        failedAt: null,
        failReason: null,
        error: null,
      },
    });
  }

  if (activeIds.length > 0) {
    await prisma.factoryInstagramAutoSourceVideo.updateMany({
      where: {
        source: { chat: { chatId: String(chatId) } },
        factoryJobId: { in: activeIds },
        status: { notIn: ["PUBLISHED", "DUPLICATE"] },
      },
      data: {
        status: "CANCELED",
        failedAt: new Date(),
        failReason: "Задача отменена через Telegram",
        error: "Задача отменена через Telegram",
      },
    });
  }

  await prisma.factoryTelegramJob.updateMany({
    where: { factoryJobId: { in: jobIds }, chat: { chatId: String(chatId) } },
    data: { status: "CANCELED", lastStatusText: "🛑 Задача отменена через Telegram" },
  });

  return { canceledNow: queuedIds.length, cancelRequested: activeIds.length };
}

function formatDate(date?: Date | string | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(date));
}

function sourceName(source: { sourceTitle?: string | null; username?: string | null; sourceUrl: string }) {
  return source.sourceTitle || (source.username ? `@${source.username}` : source.sourceUrl);
}

function daysOfContent(available: number, dailyLimit: number) {
  if (available <= 0) return "0 дней";
  return `~${Math.max(1, Math.ceil(available / Math.max(1, dailyLimit)))} дней`;
}

function formatScanResult(source: { sourceTitle?: string | null; username?: string | null; sourceUrl: string; dailyLimit: number }, result: Awaited<ReturnType<typeof checkInstagramAutoSource>>) {
  const stats = result.stats;
  const title = sourceName(source);

  if (result.cooldownUntil || result.error?.toLowerCase().includes("instagram")) {
    return [
      `✅ Instagram source added: ${title}`,
      "",
      "⚠️ Could not scan now:",
      result.error || "Instagram rate limit / login required.",
      "",
      "The source was saved, but initial video count may be incomplete.",
      result.cooldownUntil ? `Cooldown until: ${formatDate(result.cooldownUntil)}` : null,
      stats.total ? `Already in database: ${stats.total}` : null,
    ].filter(Boolean).join("\n");
  }

  if (result.foundCount === 0) {
    return [
      `✅ Instagram source added: ${title}`,
      "",
      "⚠️ No public reels found.",
      "Possible reasons:",
      "- profile has no reels",
      "- Instagram requires login",
      "- temporary rate limit",
      stats.total ? `Already in database: ${stats.total}` : null,
    ].filter(Boolean).join("\n");
  }

  return [
    `✅ Instagram source added: ${title}`,
    "",
    "📊 Scan result:",
    `Found on profile: ${result.foundCount} reels`,
    `New saved: ${result.newCount}`,
    `Already in database: ${result.duplicateCount}`,
    `Queued: ${stats.queued}`,
    `Downloaded: ${stats.downloaded}`,
    `Rendered: ${stats.rendered}`,
    `Published: ${stats.published}`,
    `Failed: ${stats.failed}`,
    `Available to use: ${stats.available}`,
    "",
    `Daily limit: ${source.dailyLimit} reels/day`,
    `Estimated days of content: ${daysOfContent(stats.available, source.dailyLimit)}`,
  ].join("\n");
}

async function sourcesText(chatId: string | number) {
  const sources = await listInstagramAutoSources(String(chatId));
  if (sources.length === 0) {
    return `📸 Instagram sources\n\nИсточников пока нет.\n\nОтправь ссылки на публичные аккаунты, например:\nhttps://www.instagram.com/example/`;
  }

  const statsMap = await getInstagramSourceUsageStats(sources.map((source) => source.id));

  return [
    "📸 Instagram sources",
    "",
    ...sources.map((source) => {
      const stats = statsMap.get(source.id) || { total: 0, available: 0, queued: 0, downloaded: 0, rendered: 0, published: 0, failed: 0, duplicate: 0 };
      return [
        sourceName(source),
        source.isEnabled ? "Status: 🟢 active" : "Status: ⏸ paused",
        `Total saved in DB: ${stats.total || source.lastFoundCount || 0}`,
        `Last scan found: ${source.lastFoundCount || 0}`,
        `Available: ${stats.available}`,
        `Queued: ${stats.queued}`,
        `Downloaded: ${stats.downloaded}`,
        `Rendered: ${stats.rendered}`,
        `Published: ${stats.published}`,
        `Failed: ${stats.failed}`,
        `Duplicates: ${stats.duplicate}`,
        `Daily limit: ${source.dailyLimit}`,
        `Estimated days: ${daysOfContent(stats.available, source.dailyLimit)}`,
        `Last scan: ${formatDate(source.lastScanAt || source.lastRunAt)}`,
        source.lastError ? `Last error: ${source.lastError}` : "Last error: none",
        source.cooldownUntil ? `Cooldown until: ${formatDate(source.cooldownUntil)}` : null,
      ].filter(Boolean).join("\n");
    }),
  ].join("\n\n");
}

function firstPublishedUrl(job: any) {
  for (const clip of job.clips || []) {
    for (const publish of clip.publishes || []) {
      if (publish.status === "PUBLISHED" && publish.platformUrl) return publish.platformUrl;
    }
  }
  return null;
}

function firstPublishError(job: any) {
  for (const clip of job.clips || []) {
    for (const publish of clip.publishes || []) {
      if (publish.status === "FAILED" && publish.error) return publish.error;
    }
  }
  return job.error || null;
}

function jobSourceLabel(job: any) {
  const video = job.instagramAutoSourceVideos?.[0];
  const source = video?.source;
  return source?.username ? `@${source.username}` : source?.sourceUrl || job.sourceUrl || "Instagram Reel";
}

function jobChannelLabel(job: any) {
  const publishAccount = job.clips?.flatMap((clip: any) => clip.publishes || [])?.find((publish: any) => publish.account)?.account;
  const targetAccount = job.targets?.find((target: any) => target.account)?.account;
  return publishAccount?.name || targetAccount?.name || "—";
}

function humanJobStatus(job: any) {
  const publishedUrl = firstPublishedUrl(job);
  if (publishedUrl) return "✅ Published";
  if (job.status === "DOWNLOADING") return "⬇️ Downloading video";
  if (job.status === "RENDERING") return "🎬 Rendering";
  if (job.status === "PUBLISHING") return "📤 Publishing to channel";
  if (job.status === "FAILED") return "❌ Failed";
  if (job.status === "CANCELED") return "🛑 Canceled";
  return "⏳ Waiting";
}

async function statusText(chatId: string | number) {
  const jobs = await prisma.factoryJob.findMany({
    where: { titlePrefix: { startsWith: "INSTAGRAM:" }, telegramJobs: { some: { chat: { chatId: String(chatId) } } } },
    orderBy: { createdAt: "desc" },
    take: FACTORY_CONFIG.telegramStatusLimit,
    include: {
      instagramAutoSourceVideos: { include: { source: true } },
      targets: { include: { account: true } },
      clips: { include: { publishes: { include: { account: true }, orderBy: { createdAt: "desc" } } }, orderBy: { index: "asc" } },
    },
  });

  if (jobs.length === 0) return "📦 Factory status\n\nInstagram-задач пока нет.";

  return [
    "📦 Factory status",
    "",
    ...jobs.map((job, index) => {
      const publishedUrl = firstPublishedUrl(job);
      const error = firstPublishError(job);
      return [
        `${index + 1}. ${jobSourceLabel(job)} → Reel`,
        `Status: ${humanJobStatus(job)}`,
        `Progress: ${job.progressLabel || `${job.progress}%`}`,
        `Channel: ${jobChannelLabel(job)}`,
        job.scheduledAt ? `Scheduled: ${formatDate(job.scheduledAt)}` : null,
        publishedUrl ? `Published URL: ${publishedUrl}` : null,
        error ? `Reason: ${String(error).slice(0, 250)}` : null,
        `Created: ${formatDate(job.createdAt)}`,
      ].filter(Boolean).join("\n");
    }),
  ].join("\n\n");
}

async function queueText(chatId: string | number) {
  const processingVideos = await prisma.factoryInstagramAutoSourceVideo.findMany({
    where: { source: { chat: { chatId: String(chatId) } }, status: { in: ["DOWNLOADING", "JOB_CREATED", "DOWNLOADED", "RENDERED", "RATE_LIMIT"] } },
    include: { source: true, factoryJob: true },
    orderBy: { updatedAt: "desc" },
    take: FACTORY_CONFIG.telegramQueueLimit,
  });

  const waitingCount = await prisma.factoryInstagramAutoSourceVideo.count({
    where: { source: { chat: { chatId: String(chatId) } }, status: { in: ["NEW", "DISCOVERED"] }, factoryJobId: null },
  });

  const publishedToday = await prisma.factoryInstagramAutoSourceVideo.count({
    where: { source: { chat: { chatId: String(chatId) } }, publishedAtChannel: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });

  const downloading = processingVideos.filter((video) => video.status === "DOWNLOADING");
  const rendering = processingVideos.filter((video) => video.factoryJob?.status === "RENDERING" || video.status === "DOWNLOADED");
  const publishing = processingVideos.filter((video) => video.factoryJob?.status === "PUBLISHING" || video.status === "RENDERED");

  const item = (video: (typeof processingVideos)[number]) => `- ${video.source.username ? `@${video.source.username}` : video.source.sourceUrl} / ${video.shortcode || "Reel"}`;
  const section = (title: string, videos: typeof processingVideos) => [title, ...(videos.length ? videos.map(item) : ["- —"])].join("\n");

  return [
    "🛠 Processing queue",
    "",
    section("⬇️ Downloading:", downloading),
    "",
    section("🎬 Rendering:", rendering),
    "",
    section("📤 Publishing:", publishing),
    "",
    "⏳ Waiting:",
    `- ${waitingCount} videos`,
    "",
    "✅ Published last 24h:",
    `- ${publishedToday} videos`,
  ].join("\n");
}

async function addSourcesFromText(chatId: string | number, text: string) {
  const urls = extractInstagramSourcesFromText(text);
  if (urls.length === 0) {
    await sendTelegramMessage(chatId, "Не вижу Instagram-аккаунтов. Пришли ссылки вида https://www.instagram.com/username/", mainKeyboard());
    return;
  }

  const results: string[] = [];
  const failed: string[] = [];

  for (const url of urls) {
    try {
      const source = await addInstagramAutoSource({ chatId: String(chatId), sourceUrl: url, dailyLimit: 10 });
      const scan = await checkInstagramAutoSource(source.id, { limit: FACTORY_CONFIG.instagramScanOnAddLimit });
      results.push(formatScanResult(source, scan));
    } catch (error) {
      failed.push(`${url} — ${humanizeInstagramAutoSourceError(error)}`);
    }
  }

  const lines = [
    ...results,
    failed.length ? `❌ Ошибки:\n${failed.join("\n")}` : null,
    "",
    "Description будет браться из Instagram, но первая строка всегда: переходи смотреть на REDFILM",
  ];

  await sendTelegramMessage(chatId, lines.filter(Boolean).join("\n\n"), mainKeyboard());
}

async function saveCookiesFromMessage(chatId: string | number, text?: string, document?: TelegramDocument) {
  if (document) {
    const content = await readTelegramFileText(document.file_id);
    await saveInstagramCookiesText(content);
    await sendTelegramMessage(chatId, "✅ Instagram cookies сохранены в БД. Значение не логирую и не показываю в боте.", mainKeyboard());
    return true;
  }

  const payload = text?.replace(/^\/set_instagram_cookies\s*/i, "").trim();
  if (!payload) {
    await sendTelegramMessage(
      chatId,
      "🍪 Пришли cookies.txt файлом или текстом после команды /set_instagram_cookies. Секрет будет сохранён в БД, не в Railway env и не в код.",
      mainKeyboard(),
    );
    return true;
  }

  await saveInstagramCookiesText(payload);
  await sendTelegramMessage(chatId, "✅ Instagram cookies сохранены в БД. Значение не логирую и не показываю в боте.", mainKeyboard());
  return true;
}

async function handleCallback(data: string, chatId: string | number, messageId: number) {
  if (data === "ig:help" || data === "ig:menu") {
    await editTelegramMessage(chatId, messageId, mainMenuText(), mainKeyboard());
    return;
  }

  if (data === "ig:sources") {
    await editTelegramMessage(chatId, messageId, await sourcesText(chatId), mainKeyboard());
    return;
  }

  if (data === "ig:deep_scan") {
    await editTelegramMessage(chatId, messageId, "🔎 Глубокий скан принят. Результат отправлю отдельным сообщением.", mainKeyboard());
    await executeDeepScan(chatId);
    return;
  }

  if (data.startsWith("ig:deep_scan_source:")) {
    const id = data.slice("ig:deep_scan_source:".length);
    await editTelegramMessage(chatId, messageId, "🔎 Глубокий скан источника принят. Результат отправлю отдельным сообщением.", mainKeyboard());
    await executeDeepScan(chatId, id);
    return;
  }

  if (data === "ig:status") {
    await editTelegramMessage(chatId, messageId, await statusText(chatId), mainKeyboard());
    return;
  }

  if (data === "ig:queue") {
    await editTelegramMessage(chatId, messageId, await queueText(chatId), mainKeyboard());
    return;
  }

  if (data === "ig:test_one") {
    await editTelegramMessage(chatId, messageId, "🧪 Тест принят: ставлю одно видео в очередь.", mainKeyboard());
    await executeTestOne(chatId);
    return;
  }

  if (data === "ig:cancel_all_confirm") {
    await editTelegramMessage(
      chatId,
      messageId,
      "🛑 Точно отменить все Instagram-задачи в очереди и обработке? Опубликованные ролики не трогаю.",
      cancelAllConfirmKeyboard(),
    );
    return;
  }

  if (data === "ig:cancel_all") {
    const result = await cancelAllInstagramTasks(chatId);
    await editTelegramMessage(
      chatId,
      messageId,
      [`🛑 Отмена выполнена.`, "", `Отменено сразу: ${result.canceledNow}`, `Запрошена отмена активных: ${result.cancelRequested}`].join("\n"),
      mainKeyboard(),
    );
    return;
  }

  if (data === "ig:pause") {
    await setInstagramSourcesActive(String(chatId), false);
    await editTelegramMessage(chatId, messageId, "⏸ Instagram-источники поставлены на паузу.", mainKeyboard());
    return;
  }

  if (data === "ig:resume") {
    await setInstagramSourcesActive(String(chatId), true);
    await editTelegramMessage(chatId, messageId, "▶️ Instagram-источники включены.", mainKeyboard());
    return;
  }

  if (data === "ig:run" || data === "ig:run_menu") {
    await editTelegramMessage(chatId, messageId, runWindowText(), runWindowKeyboard());
    return;
  }

  if (data.startsWith("ig:run_until:")) {
    const hour = data.slice("ig:run_until:".length);
    await editTelegramMessage(chatId, messageId, `▶️ Запуск принят: ${formatInstagramPublishWindowLabel(normalizeInstagramPublishEndHour(hour))}`, mainKeyboard());
    await executeRunToday(chatId, hour);
    return;
  }

  if (data.startsWith("ig:check:")) {
    const id = data.slice("ig:check:".length);
    await editTelegramMessage(chatId, messageId, "🔍 Проверяю Instagram-источник...", mainKeyboard());
    const source = await prisma.factoryInstagramAutoSource.findUnique({ where: { id } });
    if (!source) throw new Error("Instagram-источник не найден");
    const result = await checkInstagramAutoSource(id, { limit: FACTORY_CONFIG.instagramScanOnAddLimit });
    await sendTelegramMessage(chatId, `${formatScanResult(source, result)}\n\nПримеры:\n${result.examples.slice(0, 5).join("\n") || "—"}`, sourceKeyboard(id));
  }
}

export async function POST(request: Request) {
  if (!configuredSecretIsValid(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;

  if (update.callback_query?.message) {
    const chatId = update.callback_query.message.chat.id;
    await upsertTelegramChat({ chatId, user: update.callback_query.from });
    if (!allowedChatIds().includes(String(chatId))) {
      await denied(chatId);
      return NextResponse.json({ ok: true });
    }

    const data = update.callback_query.data || "";
    await answerCallbackQuery(update.callback_query.id).catch(() => undefined);
    await handleCallback(data, chatId, update.callback_query.message.message_id).catch((error) =>
      sendTelegramMessage(chatId, `❌ Ошибка: ${humanizeInstagramAutoSourceError(error)}`, mainKeyboard()),
    );
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;
  await upsertTelegramChat({ chatId, user: message.from });

  if (!allowedChatIds().includes(String(chatId))) {
    await denied(chatId);
    return NextResponse.json({ ok: true });
  }

  const text = message.text?.trim() || "";

  try {
    if (message.document) {
      const name = message.document.file_name?.toLowerCase() || "";
      if (name.includes("cookie") || name.endsWith(".txt")) {
        await saveCookiesFromMessage(chatId, text, message.document);
        return NextResponse.json({ ok: true });
      }
    }

    if (!text || text === "/start" || text === "/help" || text === "/menu") {
      await sendTelegramMessage(chatId, mainMenuText(), mainKeyboard());
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/set_instagram_cookies")) {
      await saveCookiesFromMessage(chatId, text, message.document);
      return NextResponse.json({ ok: true });
    }

    if (text === "/instagram_sources" || text === "/sources") {
      await sendTelegramMessage(chatId, await sourcesText(chatId), mainKeyboard());
      return NextResponse.json({ ok: true });
    }

    if (text === "/instagram_deep_scan" || text === "/deep_scan") {
      await executeDeepScan(chatId);
      return NextResponse.json({ ok: true });
    }

    if (text === "/instagram_status" || text === "/status") {
      await sendTelegramMessage(chatId, await statusText(chatId), mainKeyboard());
      return NextResponse.json({ ok: true });
    }

    if (text === "/queue") {
      await sendTelegramMessage(chatId, await queueText(chatId), mainKeyboard());
      return NextResponse.json({ ok: true });
    }

    if (text === "/instagram_pause") {
      await setInstagramSourcesActive(String(chatId), false);
      await sendTelegramMessage(chatId, "⏸ Instagram-источники поставлены на паузу.", mainKeyboard());
      return NextResponse.json({ ok: true });
    }

    if (text === "/instagram_resume") {
      await setInstagramSourcesActive(String(chatId), true);
      await sendTelegramMessage(chatId, "▶️ Instagram-источники включены.", mainKeyboard());
      return NextResponse.json({ ok: true });
    }

    if (text === "/instagram_run_today" || text === "/run_today") {
      await sendTelegramMessage(chatId, runWindowText(), runWindowKeyboard());
      return NextResponse.json({ ok: true });
    }

    if (text === "/instagram_test_one" || text === "/test_one") {
      await executeTestOne(chatId);
      return NextResponse.json({ ok: true });
    }

    if (text === "/cancel_all_tasks" || text === "/cancel_all") {
      await sendTelegramMessage(
        chatId,
        "🛑 Точно отменить все Instagram-задачи в очереди и обработке? Опубликованные ролики не трогаю.",
        cancelAllConfirmKeyboard(),
      );
      return NextResponse.json({ ok: true });
    }

    const runCommandMatch = text.match(/^\/(?:instagram_run_today|run_today)\s+(.+)$/i);
    if (runCommandMatch) {
      await executeRunToday(chatId, runCommandMatch[1]);
      return NextResponse.json({ ok: true });
    }

    await addSourcesFromText(chatId, text);
    return NextResponse.json({ ok: true });
  } catch (error) {
    await sendTelegramMessage(chatId, `❌ Ошибка: ${humanizeInstagramAutoSourceError(error)}`, mainKeyboard());
    return NextResponse.json({ ok: true });
  }
}
