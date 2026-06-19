import { chromium, type Page } from "playwright";

import { prisma } from "@/lib/prisma";
import { withDbRetry } from "@/lib/factory/db-retry";

type ParsedVkVideo = {
  sourceVideoId: string;
  sourceUrl: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  score: number;
};

const VK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36";

function cleanText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVkGroupUrl(value: string) {
  const raw = value.trim();

  if (!raw) {
    throw new Error("Вставь ссылку на VK-группу");
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host !== "vk.com" && host !== "m.vk.com") {
    throw new Error("Нужна ссылка на группу VK, например https://vk.com/club123 или https://vk.com/publicname");
  }

  const slug = url.pathname.split("/").filter(Boolean)[0];

  if (!slug) {
    throw new Error("Не получилось понять адрес VK-группы");
  }

  return `https://vk.com/${slug}`;
}

function getGroupSlug(groupUrl: string) {
  const url = new URL(groupUrl);
  return url.pathname.split("/").filter(Boolean)[0] ?? "";
}

function buildGroupScanUrls(groupUrl: string) {
  const slug = getGroupSlug(groupUrl);

  return Array.from(
    new Set([
      groupUrl,
      `https://vk.com/${slug}?z=video`,
      `https://vk.com/${slug}?w=video`,
      `https://vk.com/video/@${slug}`,
      `https://vk.com/video/${slug}`,
      `https://vk.com/videos/${slug}`,
      `https://vk.com/clips/${slug}`,
      `https://m.vk.com/${slug}`,
      `https://m.vk.com/video/${slug}`,
    ]),
  );
}

function extractMetaTitle(html: string) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return cleanText(og || title || "VK-группа").replace(/\s*\|\s*VK$/i, "");
}

function titleNear(html: string, position: number) {
  const start = Math.max(0, position - 1000);
  const end = Math.min(html.length, position + 1800);
  const slice = html.slice(start, end);

  const titlePatterns = [
    /"title"\s*:\s*"([^"]{4,180})"/i,
    /"name"\s*:\s*"([^"]{4,180})"/i,
    /data-title=["']([^"']{4,180})["']/i,
    /aria-label=["']([^"']{4,180})["']/i,
    /title=["']([^"']{4,180})["']/i,
  ];

  for (const pattern of titlePatterns) {
    const clean = cleanText(slice.match(pattern)?.[1]);
    if (clean && !/^vk\s*$/i.test(clean) && !clean.toLowerCase().includes("video")) {
      return clean;
    }
  }

  return "Смешное видео с котиком";
}

function thumbnailNear(html: string, position: number) {
  const start = Math.max(0, position - 1200);
  const end = Math.min(html.length, position + 2400);
  const slice = html.slice(start, end).replace(/\\\//g, "/");
  return slice.match(/https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/i)?.[0] ?? null;
}

function scoreVkCandidate(title: string, durationSeconds: number | null) {
  const text = title.toLowerCase();
  let score = 50;

  if (text.includes("кот") || text.includes("кош")) score += 25;
  if (text.includes("смеш") || text.includes("угар") || text.includes("прикол")) score += 18;
  if (text.includes("мем") || text.includes("ржа")) score += 12;
  if (text.includes("животн") || text.includes("пёс") || text.includes("собак")) score += 8;

  if (durationSeconds) {
    if (durationSeconds >= 8 && durationSeconds <= 90) score += 18;
    else if (durationSeconds <= 180) score += 8;
    else if (durationSeconds > 600) score -= 25;
  }

  if (text.includes("фильм") || text.includes("сериал") || text.includes("трейлер")) score -= 40;
  if (text.includes("новости") || text.includes("полит")) score -= 35;

  return Math.max(1, Math.min(100, score));
}

function parseVkVideosFromHtml(html: string) {
  const normalizedHtml = html.replace(/\\\//g, "/");
  const matches: Array<{ id: string; index: number }> = [];
  const patterns = [
    /(?:https?:\/\/vk\.com)?\/video(-?\d+_\d+)/gi,
    /(?:https?:\/\/vkvideo\.ru)?\/video(-?\d+_\d+)/gi,
    /"video_id"\s*:\s*"?(-?\d+_\d+)"?/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalizedHtml))) {
      if (!match[1]) continue;
      matches.push({ id: match[1], index: match.index });
    }
  }

  const unique = new Map<string, ParsedVkVideo>();

  for (const item of matches) {
    const title = titleNear(normalizedHtml, item.index);
    const thumbnailUrl = thumbnailNear(normalizedHtml, item.index);
    const sourceUrl = `https://vk.com/video${item.id}`;
    const score = scoreVkCandidate(title, null);

    if (!unique.has(item.id)) {
      unique.set(item.id, {
        sourceVideoId: item.id,
        sourceUrl,
        title,
        description: null,
        thumbnailUrl,
        durationSeconds: null,
        score,
      });
    }
  }

  return Array.from(unique.values()).sort((a, b) => b.score - a.score);
}

async function fetchVkHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": VK_UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`VK вернул HTTP ${response.status}`);
  }

  return response.text();
}

async function collectVkVideoLinksFromPage(page: Page) {
  return (await page.evaluate(`
    (() => {
      const cleanText = (value) => String(value || "")
        .replace(/\s+/g, " ")
        .trim();

      const getAroundText = (element) => {
        const card =
          element.closest("article") ||
          element.closest(".video_item") ||
          element.closest(".VideoCard") ||
          element.closest(".vkuiCard") ||
          element.closest(".wall_item") ||
          element.closest(".post") ||
          element.closest("div");

        return cleanText(card ? card.textContent : element.textContent);
      };

      return Array.from(document.querySelectorAll("a[href*='video'], a[href*='clip']"))
        .map((link) => {
          const href = link.href || link.getAttribute("href") || "";
          const text = [
            link.getAttribute("aria-label") || "",
            link.getAttribute("title") || "",
            link.textContent || "",
            getAroundText(link),
          ].join(" ");
          const image = link.querySelector("img") || link.closest("div")?.querySelector("img");

          return {
            href,
            text: cleanText(text),
            thumbnailUrl: image ? (image.currentSrc || image.src || image.getAttribute("src") || "") : "",
          };
        })
        .filter((item) => item.href);
    })()
  `)) as Array<{ href: string; text: string; thumbnailUrl: string }>;
}

function parseVkVideoIdFromUrl(value: string) {
  const normalized = value.replace(/\\\//g, "/");
  const video = normalized.match(/video(-?\d+_\d+)/i)?.[1];
  if (video) return video;

  const clip = normalized.match(/clip(-?\d+_\d+)/i)?.[1];
  if (clip) return clip;

  return null;
}

function normalizeVkVideoUrl(value: string) {
  const id = parseVkVideoIdFromUrl(value);
  if (id) return `https://vk.com/video${id}`;

  try {
    const url = new URL(value);
    return `https://vk.com${url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

function videoTitleFromBrowserText(text: string) {
  const cleaned = cleanText(text)
    .replace(/^(Смотреть|Видео|Клип|VK Видео|ВКонтакте)\s*/i, "")
    .replace(/\b(?:нравится|комментарии|поделиться|просмотры|просмотров)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 4) {
    return "Смешное видео с котиком";
  }

  return cleaned.slice(0, 180);
}

async function scanVkGroupWithBrowser(groupUrl: string, limit: number) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      locale: "ru-RU",
      userAgent: VK_UA,
    });
    const page = await context.newPage();
    const found = new Map<string, ParsedVkVideo>();

    for (const url of buildGroupScanUrls(groupUrl)) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForTimeout(2500);

        for (let step = 0; step < 4; step += 1) {
          await page.mouse.wheel(0, 1400).catch(() => {});
          await page.waitForTimeout(900);
        }

        const htmlCandidates = parseVkVideosFromHtml(await page.content());
        for (const candidate of htmlCandidates) {
          if (!found.has(candidate.sourceVideoId)) found.set(candidate.sourceVideoId, candidate);
        }

        const links = await collectVkVideoLinksFromPage(page);
        for (const item of links) {
          const sourceVideoId = parseVkVideoIdFromUrl(item.href);
          if (!sourceVideoId || found.has(sourceVideoId)) continue;

          const title = videoTitleFromBrowserText(item.text);
          found.set(sourceVideoId, {
            sourceVideoId,
            sourceUrl: normalizeVkVideoUrl(item.href),
            title,
            description: null,
            thumbnailUrl: item.thumbnailUrl || null,
            durationSeconds: null,
            score: scoreVkCandidate(title, null),
          });
        }
      } catch {
        // VK часто отдает разные страницы/редиректы. Пробуем следующий URL.
      }
    }

    return Array.from(found.values()).sort((a, b) => b.score - a.score).slice(0, limit);
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function listVkGroups() {
  return withDbRetry(() =>
    prisma.factoryVkGroup.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: {
        candidates: {
          orderBy: [{ isUsed: "asc" }, { score: "desc" }, { createdAt: "desc" }],
          take: 12,
        },
      },
    }),
  );
}

export async function addVkGroup(input: { sourceUrl: string; name?: string | null; category?: string | null }) {
  const url = normalizeVkGroupUrl(input.sourceUrl);
  const slug = getGroupSlug(url);
  let name = cleanText(input.name || "");

  if (!name) {
    try {
      const html = await fetchVkHtml(url);
      name = extractMetaTitle(html) || slug;
    } catch {
      name = slug;
    }
  }

  return withDbRetry(() =>
    prisma.factoryVkGroup.upsert({
      where: { url },
      create: {
        name,
        url,
        category: input.category?.trim() || "котики",
        isActive: true,
      },
      update: {
        name,
        category: input.category?.trim() || "котики",
        isActive: true,
        lastError: null,
      },
    }),
  );
}

export async function setVkGroupActive(input: { id: string; isActive: boolean }) {
  return withDbRetry(() =>
    prisma.factoryVkGroup.update({
      where: { id: input.id },
      data: { isActive: input.isActive },
    }),
  );
}

export async function scanVkGroup(groupId: string, limit = 12) {
  const group = await withDbRetry(() =>
    prisma.factoryVkGroup.findUnique({ where: { id: groupId } }),
  );

  if (!group) throw new Error("VK-группа не найдена");

  const parsed: ParsedVkVideo[] = [];
  let lastError: unknown = null;

  for (const url of buildGroupScanUrls(group.url)) {
    try {
      parsed.push(...parseVkVideosFromHtml(await fetchVkHtml(url)));
    } catch (error) {
      lastError = error;
    }
  }

  let unique = Array.from(new Map(parsed.map((video) => [video.sourceVideoId, video])).values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (unique.length === 0) {
    try {
      unique = await scanVkGroupWithBrowser(group.url, limit);
    } catch (error) {
      lastError = error;
    }
  }

  if (unique.length === 0) {
    const message =
      lastError instanceof Error
        ? lastError.message
        : "VK не отдал видео на публичной странице. Часто такое бывает, если группа закрывает видео от гостей или VK показывает страницу только после авторизации.";

    await withDbRetry(() =>
      prisma.factoryVkGroup.update({
        where: { id: group.id },
        data: { lastCheckedAt: new Date(), lastError: message },
      }),
    );

    throw new Error(`Не нашел видео в группе ${group.name}. ${message}`);
  }

  const candidates = [];

  for (const video of unique) {
    candidates.push(
      await withDbRetry(() =>
        prisma.factoryVkVideoCandidate.upsert({
          where: { sourceVideoId: video.sourceVideoId },
          create: {
            groupId: group.id,
            sourceVideoId: video.sourceVideoId,
            sourceUrl: video.sourceUrl,
            title: video.title,
            description: video.description,
            thumbnailUrl: video.thumbnailUrl,
            durationSeconds: video.durationSeconds,
            score: video.score,
          },
          update: {
            groupId: group.id,
            sourceUrl: video.sourceUrl,
            title: video.title,
            description: video.description,
            thumbnailUrl: video.thumbnailUrl,
            durationSeconds: video.durationSeconds,
            score: video.score,
          },
        }),
      ),
    );
  }

  await withDbRetry(() =>
    prisma.factoryVkGroup.update({
      where: { id: group.id },
      data: { lastCheckedAt: new Date(), lastError: null },
    }),
  );

  return candidates;
}

export async function buildVkDailyCandidates(input: { limit?: number } = {}) {
  const limit = Math.max(1, Math.min(20, input.limit ?? 3));

  return withDbRetry(() =>
    prisma.factoryVkVideoCandidate.findMany({
      where: { isUsed: false, group: { isActive: true } },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: limit,
      include: { group: true },
    }),
  );
}

export async function scanAllVkGroups(input: { limitPerGroup?: number } = {}) {
  const groups = await withDbRetry(() =>
    prisma.factoryVkGroup.findMany({
      where: { isActive: true },
      orderBy: [{ lastCheckedAt: "asc" }, { createdAt: "asc" }],
    }),
  );

  const errors: Array<{ groupId: string; name: string; message: string }> = [];
  let created = 0;

  for (const group of groups) {
    try {
      created += (await scanVkGroup(group.id, input.limitPerGroup ?? 8)).length;
    } catch (error) {
      errors.push({
        groupId: group.id,
        name: group.name,
        message: error instanceof Error ? error.message : "Не получилось проверить группу",
      });
    }
  }

  return {
    checked: groups.length,
    created,
    errors,
    candidates: await buildVkDailyCandidates({ limit: 3 }),
  };
}

export function buildRussianVkTitle(input: { sourceTitle: string; clipIndex: number }) {
  const base = cleanText(input.sourceTitle)
    .replace(/#\S+/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[|•]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const fallback = [
    "Котик выдал слишком смешную реакцию",
    "Этот момент с котом хочется пересмотреть",
    "Кот явно был не готов к такому повороту",
    "Смешной момент с котиком пошел не по плану",
    "Этот кот устроил хаос за пару секунд",
    "Реакция кота получилась слишком жизненной",
    "Котик сделал этот момент смешнее в два раза",
    "Этот пушистый момент невозможно смотреть спокойно",
  ];

  const endings = [
    " — смешной момент",
    " — реакция котика",
    " — это надо видеть",
    " — неожиданный поворот",
    " — короткая нарезка",
    " — слишком смешно",
    " — момент дня",
    " — котик удивил",
  ];

  if (!base || base.length < 6 || /^(video|clip|без названия|смешное видео)$/i.test(base)) {
    return fallback[(input.clipIndex - 1) % fallback.length];
  }

  const shortBase = base.length > 62 ? `${base.slice(0, 62).trim()}…` : base;
  return `${shortBase}${endings[(input.clipIndex - 1) % endings.length]}`.slice(0, 95);
}

export function buildRussianVkDescription(input: { sourceTitle: string }) {
  const title = cleanText(input.sourceTitle);

  return [
    title ? `Смешная короткая нарезка: ${title}` : "Смешная короткая нарезка с котиками и животными.",
    "",
    "Подборка сделана автоматически из VK-видео.",
    "",
    "#котики #животные #shorts",
  ].join("\n");
}
