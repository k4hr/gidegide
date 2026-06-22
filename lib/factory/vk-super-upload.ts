import { chromium, type Page } from "playwright";

import { prisma } from "../prisma";
import { withDbRetry } from "./db-retry";

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

function isGenericVkTitle(value: string | null | undefined) {
  const text = cleanText(value).toLowerCase();

  if (!text) return true;
  if (text.length < 6) return true;
  if (
    /^(vk|вк|vk video|vk видео|видео|video|kinobro|киноbro|без названия)$/i.test(
      text,
    )
  )
    return true;
  if (/^смешное видео с котиком$/i.test(text)) return true;
  if (/^видео\s*-?\d+_\d+$/i.test(text)) return true;
  if (text.includes("vk видео") && text.length < 30) return true;
  if (text.includes("вконтакте") && text.length < 30) return true;

  return false;
}

function normalizeCandidateTitle(value: string | null | undefined) {
  const title = cleanText(value)
    .replace(/^смотреть\s+/i, "")
    .replace(/^vk\s*видео\s*/i, "")
    .replace(/^видео\s*/i, "")
    .replace(/\s*[|—-]\s*(?:VK Видео|VK|ВКонтакте)\s*$/i, "")
    .replace(
      /\b(?:нравится|комментарии|поделиться|просмотры|просмотров)\b.*$/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  if (isGenericVkTitle(title)) return null;

  return title.slice(0, 180);
}

function mergeVkCandidateTitle(
  current: ParsedVkVideo,
  nextTitle: string | null,
) {
  if (!nextTitle) return current;

  if (
    isGenericVkTitle(current.title) ||
    nextTitle.length > current.title.length
  ) {
    return {
      ...current,
      title: nextTitle,
      score: scoreVkCandidate(nextTitle, current.durationSeconds),
    };
  }

  return current;
}

function normalizeVkGroupUrl(value: string) {
  const raw = value.trim();

  if (!raw) {
    throw new Error("Вставь ссылку на VK-группу или VK Video канал");
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withProtocol);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "vkvideo.ru") {
    const parts = url.pathname.split("/").filter(Boolean);
    const first = parts[0] ?? "";

    if (!first) {
      throw new Error("Не получилось понять адрес VK Video канала");
    }

    if (first.startsWith("@")) {
      return `https://vkvideo.ru/${first}`;
    }

    if (/^video-?\d+_\d+/i.test(first)) {
      return `https://vkvideo.ru/${first}`;
    }

    throw new Error(
      "Нужна ссылка на VK Video канал, например https://vkvideo.ru/@kinobro, или ссылка на VK-видео",
    );
  }

  if (host !== "vk.com" && host !== "m.vk.com") {
    throw new Error(
      "Нужна ссылка на VK-группу или VK Video канал, например https://vkvideo.ru/@kinobro",
    );
  }

  const slug = url.pathname.split("/").filter(Boolean)[0];

  if (!slug) {
    throw new Error("Не получилось понять адрес VK-источника");
  }

  if (/^video-?\d+_\d+/i.test(slug)) {
    return `https://vk.com/${slug}`;
  }

  return `https://vk.com/${slug}`;
}

function getSourceSlug(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const first = url.pathname.split("/").filter(Boolean)[0] ?? "";

  if (host === "vkvideo.ru" && first.startsWith("@")) {
    return first.slice(1);
  }

  return first;
}

function buildGroupScanUrls(groupUrl: string) {
  const url = new URL(groupUrl);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const slug = getSourceSlug(groupUrl);

  if (host === "vkvideo.ru") {
    if (
      /^video-?\d+_\d+/i.test(url.pathname.split("/").filter(Boolean)[0] ?? "")
    ) {
      return [groupUrl];
    }

    return Array.from(
      new Set([
        groupUrl,
        `https://vkvideo.ru/@${slug}`,
        `https://vkvideo.ru/@${slug}/videos`,
        `https://vkvideo.ru/@${slug}/all`,
      ]),
    );
  }

  if (/^video-?\d+_\d+/i.test(slug)) {
    return [groupUrl];
  }

  return Array.from(
    new Set([
      groupUrl,
      `https://vk.com/${slug}?z=video`,
      `https://vk.com/${slug}?w=video`,
      `https://vk.com/video/@${slug}`,
      `https://vk.com/video/${slug}`,
      `https://vk.com/videos/${slug}`,
      `https://m.vk.com/${slug}`,
      `https://m.vk.com/video/${slug}`,
      `https://vkvideo.ru/@${slug}`,
      `https://vkvideo.ru/@${slug}/videos`,
    ]),
  );
}

function extractMetaTitle(html: string) {
  const og = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  )?.[1];
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return cleanText(og || title || "VK-источник").replace(/\s*\|\s*VK$/i, "");
}

function titleNear(html: string, position: number) {
  const start = Math.max(0, position - 2400);
  const end = Math.min(html.length, position + 3600);
  const slice = html.slice(start, end);

  const titlePatterns = [
    /"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*){0,20})"/i,
    /"name"\s*:\s*"([^"\\]*(?:\\.[^"\\]*){0,20})"/i,
    /"caption"\s*:\s*"([^"\\]*(?:\\.[^"\\]*){0,20})"/i,
    /"description"\s*:\s*"([^"\\]*(?:\\.[^"\\]*){0,20})"/i,
    /data-title=["']([^"']{4,220})["']/i,
    /aria-label=["']([^"']{4,220})["']/i,
    /title=["']([^"']{4,220})["']/i,
    /alt=["']([^"']{4,220})["']/i,
  ];

  for (const pattern of titlePatterns) {
    const raw = slice.match(pattern)?.[1];
    const clean = normalizeCandidateTitle(raw);
    if (clean) return clean;
  }

  return null;
}

function thumbnailNear(html: string, position: number) {
  const start = Math.max(0, position - 1200);
  const end = Math.min(html.length, position + 2400);
  const slice = html.slice(start, end).replace(/\\\//g, "/");
  return (
    slice.match(
      /https?:\/\/[^"'\s<>]+\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s<>]*)?/i,
    )?.[0] ?? null
  );
}

function scoreVkCandidate(title: string, durationSeconds: number | null) {
  const text = title.toLowerCase();
  let score = 50;

  if (text.includes("кот") || text.includes("кош")) score += 25;
  if (text.includes("смеш") || text.includes("угар") || text.includes("прикол"))
    score += 18;
  if (text.includes("мем") || text.includes("ржа")) score += 12;
  if (text.includes("животн") || text.includes("пёс") || text.includes("собак"))
    score += 8;

  if (durationSeconds) {
    if (durationSeconds >= 8 && durationSeconds <= 90) score += 18;
    else if (durationSeconds <= 180) score += 8;
    else if (durationSeconds > 600) score -= 25;
  }

  if (
    text.includes("фильм") ||
    text.includes("сериал") ||
    text.includes("трейлер")
  )
    score -= 40;
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
    const title = titleNear(normalizedHtml, item.index) ?? `Видео ${item.id}`;
    const thumbnailUrl = thumbnailNear(normalizedHtml, item.index);
    const sourceUrl = `https://vkvideo.ru/video${item.id}`;
    const score = scoreVkCandidate(title, null);

    const nextCandidate: ParsedVkVideo = {
      sourceVideoId: item.id,
      sourceUrl,
      title,
      description: null,
      thumbnailUrl,
      durationSeconds: null,
      score,
    };

    const current = unique.get(item.id);
    unique.set(
      item.id,
      current
        ? mergeVkCandidateTitle(current, normalizeCandidateTitle(title))
        : nextCandidate,
    );
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
        .replace(/\\s+/g, " ")
        .trim();

      const pickGoodText = (values) => {
        const bad = /^(vk|вк|vk video|vk видео|видео|video|kinobro|смотреть)$/i;
        return values
          .map(cleanText)
          .filter(Boolean)
          .filter((text) => text.length >= 6 && text.length <= 260)
          .filter((text) => !bad.test(text))
          .sort((a, b) => a.length - b.length)[0] || "";
      };

      const getAroundText = (element) => {
        const values = [];
        let node = element;

        for (let depth = 0; node && depth < 8; depth += 1) {
          values.push(node.textContent || "");
          const titleNode = node.querySelector?.('[title], [aria-label], img[alt], h1, h2, h3, [class*=title], [class*=Title], [class*=name], [class*=Name]');
          if (titleNode) {
            values.push(titleNode.getAttribute('title') || "");
            values.push(titleNode.getAttribute('aria-label') || "");
            values.push(titleNode.getAttribute('alt') || "");
            values.push(titleNode.textContent || "");
          }
          node = node.parentElement;
        }

        return pickGoodText(values);
      };

      return Array.from(document.querySelectorAll("a[href*='video']"))
        .map((link) => {
          const href = link.href || link.getAttribute("href") || "";
          const image = link.querySelector("img") || link.closest("div")?.querySelector("img");
          const text = pickGoodText([
            link.getAttribute("aria-label") || "",
            link.getAttribute("title") || "",
            image ? (image.getAttribute("alt") || image.getAttribute("title") || "") : "",
            link.textContent || "",
            getAroundText(link),
          ]);

          return {
            href,
            text,
            thumbnailUrl: image ? (image.currentSrc || image.src || image.getAttribute("src") || "") : "",
          };
        })
        .filter((item) => item.href && /video-?\\d+_\\d+/i.test(item.href));
    })()
  `)) as Array<{ href: string; text: string; thumbnailUrl: string }>;
}

async function extractTitleFromCurrentVideoPage(page: Page) {
  const values = (await page.evaluate(`
    (() => {
      const meta = (selector) => document.querySelector(selector)?.getAttribute('content') || '';
      const text = (selector) => document.querySelector(selector)?.textContent || '';

      return [
        meta('meta[property="og:title"]'),
        meta('meta[name="twitter:title"]'),
        text('h1'),
        text('h2'),
        text('[class*=title]'),
        text('[class*=Title]'),
        document.title || '',
      ];
    })()
  `)) as string[];

  for (const value of values) {
    const title = normalizeCandidateTitle(value);
    if (title) return title;
  }

  return null;
}

async function enrichCandidatesFromVideoPages(
  page: Page,
  candidates: ParsedVkVideo[],
  limit: number,
) {
  const result: ParsedVkVideo[] = [];

  for (const candidate of candidates.slice(0, limit)) {
    let next = candidate;

    if (isGenericVkTitle(candidate.title)) {
      const urls = Array.from(
        new Set([
          candidate.sourceUrl,
          `https://vkvideo.ru/video${candidate.sourceVideoId}`,
          `https://vk.com/video${candidate.sourceVideoId}`,
        ]),
      );

      for (const url of urls) {
        try {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 45000,
          });
          await page.waitForTimeout(1200);
          const title = await extractTitleFromCurrentVideoPage(page);
          next = mergeVkCandidateTitle(next, title);
          if (!isGenericVkTitle(next.title)) break;
        } catch {
          // Пробуем следующий URL.
        }
      }
    }

    result.push(next);
  }

  return [...result, ...candidates.slice(limit)];
}

function parseVkVideoIdFromUrl(value: string) {
  const normalized = value.replace(/\\\//g, "/");
  const video = normalized.match(/video(-?\d+_\d+)/i)?.[1];
  if (video) return video;

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
  return normalizeCandidateTitle(text);
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
          const current = found.get(candidate.sourceVideoId);
          found.set(
            candidate.sourceVideoId,
            current
              ? {
                  ...mergeVkCandidateTitle(
                    current,
                    normalizeCandidateTitle(candidate.title),
                  ),
                  thumbnailUrl: current.thumbnailUrl || candidate.thumbnailUrl,
                }
              : candidate,
          );
        }

        const links = await collectVkVideoLinksFromPage(page);
        for (const item of links) {
          const sourceVideoId = parseVkVideoIdFromUrl(item.href);
          if (!sourceVideoId) continue;

          const title = videoTitleFromBrowserText(item.text);
          const current = found.get(sourceVideoId);
          const nextCandidate: ParsedVkVideo = {
            sourceVideoId,
            sourceUrl: normalizeVkVideoUrl(item.href),
            title: title ?? `Видео ${sourceVideoId}`,
            description: null,
            thumbnailUrl: item.thumbnailUrl || null,
            durationSeconds: null,
            score: scoreVkCandidate(title ?? `Видео ${sourceVideoId}`, null),
          };

          found.set(
            sourceVideoId,
            current
              ? {
                  ...mergeVkCandidateTitle(current, title),
                  thumbnailUrl:
                    current.thumbnailUrl || nextCandidate.thumbnailUrl,
                  sourceUrl: current.sourceUrl || nextCandidate.sourceUrl,
                }
              : nextCandidate,
          );
        }
      } catch {
        // VK часто отдает разные страницы/редиректы. Пробуем следующий URL.
      }
    }

    const sorted = Array.from(found.values()).sort((a, b) => b.score - a.score);
    const enriched = await enrichCandidatesFromVideoPages(
      page,
      sorted,
      Math.min(sorted.length, Math.max(limit * 2, 6)),
    );

    return enriched.sort((a, b) => b.score - a.score).slice(0, limit);
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
          orderBy: [
            { isUsed: "asc" },
            { score: "desc" },
            { createdAt: "desc" },
          ],
          take: 12,
        },
      },
    }),
  );
}

export async function addVkGroup(input: {
  sourceUrl: string;
  name?: string | null;
  category?: string | null;
}) {
  const url = normalizeVkGroupUrl(input.sourceUrl);
  const slug = getSourceSlug(url);
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

export async function setVkGroupActive(input: {
  id: string;
  isActive: boolean;
}) {
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

  if (!group) throw new Error("VK-источник или VK Video канал не найдены");

  const parsed: ParsedVkVideo[] = [];
  let lastError: unknown = null;

  for (const url of buildGroupScanUrls(group.url)) {
    try {
      parsed.push(...parseVkVideosFromHtml(await fetchVkHtml(url)));
    } catch (error) {
      lastError = error;
    }
  }

  let unique = Array.from(
    new Map(parsed.map((video) => [video.sourceVideoId, video])).values(),
  )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (
    unique.length === 0 ||
    unique.some((video) => isGenericVkTitle(video.title))
  ) {
    try {
      const browserCandidates = await scanVkGroupWithBrowser(group.url, limit);
      const merged = new Map<string, ParsedVkVideo>();

      for (const video of unique) {
        merged.set(video.sourceVideoId, video);
      }

      for (const video of browserCandidates) {
        const current = merged.get(video.sourceVideoId);
        merged.set(
          video.sourceVideoId,
          current
            ? {
                ...mergeVkCandidateTitle(
                  current,
                  normalizeCandidateTitle(video.title),
                ),
                sourceUrl: current.sourceUrl || video.sourceUrl,
                thumbnailUrl: current.thumbnailUrl || video.thumbnailUrl,
                durationSeconds:
                  current.durationSeconds || video.durationSeconds,
              }
            : video,
        );
      }

      unique = Array.from(merged.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    } catch (error) {
      lastError = error;
    }
  }

  if (unique.length === 0) {
    const message =
      lastError instanceof Error
        ? lastError.message
        : "VK не отдал видео на публичной странице. Часто такое бывает, если источник закрывает видео от гостей или VK показывает страницу только после авторизации.";

    await withDbRetry(() =>
      prisma.factoryVkGroup.update({
        where: { id: group.id },
        data: { lastCheckedAt: new Date(), lastError: message },
      }),
    );

    throw new Error(`Не нашел видео в источнике ${group.name}. ${message}`);
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

export async function getPublicVkSourceVideos(input: {
  sourceUrl: string;
  limit: number;
}) {
  const sourceUrl = normalizeVkGroupUrl(input.sourceUrl);
  const parsed: ParsedVkVideo[] = [];
  let lastError: unknown = null;

  for (const url of buildGroupScanUrls(sourceUrl)) {
    try {
      parsed.push(...parseVkVideosFromHtml(await fetchVkHtml(url)));
    } catch (error) {
      lastError = error;
    }
  }

  const unique = Array.from(
    new Map(parsed.map((video) => [video.sourceVideoId, video])).values(),
  ).slice(0, Math.max(1, Math.min(200, input.limit)));

  if (!unique.length) {
    throw new Error(
      lastError instanceof Error
        ? `Публичный список VK недоступен: ${lastError.message}`
        : "Публичный список VK не содержит видео",
    );
  }

  return unique.map((video) => ({
    providerVideoId: video.sourceVideoId,
    videoUrl: normalizeVkVideoUrl(video.sourceUrl),
    title: video.title,
    durationSec: video.durationSeconds ?? undefined,
    thumbnailUrl: video.thumbnailUrl ?? undefined,
  }));
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
        message:
          error instanceof Error
            ? error.message
            : "Не получилось проверить источник",
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

export function buildRussianVkTitle(input: {
  sourceTitle: string;
  clipIndex: number;
}) {
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

  if (
    !base ||
    base.length < 6 ||
    /^(video|clip|видео\s*-?\d+_\d+|без названия|смешное видео)$/i.test(base)
  ) {
    return fallback[(input.clipIndex - 1) % fallback.length];
  }

  const shortBase = base.length > 62 ? `${base.slice(0, 62).trim()}…` : base;
  return `${shortBase}${endings[(input.clipIndex - 1) % endings.length]}`.slice(
    0,
    95,
  );
}

export function buildRussianVkDescription(input: { sourceTitle: string }) {
  const title = cleanText(input.sourceTitle);

  return [
    title
      ? `Смешная короткая нарезка: ${title}`
      : "Смешная короткая нарезка с котиками и животными.",
    "",
    "Подборка сделана автоматически из VK-видео.",
    "",
    "#котики #животные #shorts",
  ].join("\n");
}
