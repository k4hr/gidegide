const KINOPOISK_SEARCH_V21 = "https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword";
const KINOPOISK_SEARCH_V22 = "https://kinopoiskapiunofficial.tech/api/v2.2/films";
const KINOPOISK_FILM_V22 = "https://kinopoiskapiunofficial.tech/api/v2.2/films";
const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

export type MovieAiTitlePack = {
  movieTitle: string;
  movieYear: string | null;
  movieDescription: string;
  titles: string[];
  /** Общий fallback description для совместимости со старым кодом. */
  description: string;
  /** Отдельное описание для каждого ролика. */
  descriptions: string[];
  source: "openai" | "fallback";
};

type KinopoiskMovie = {
  kinopoiskId?: number;
  filmId?: number;
  nameRu?: string | null;
  nameEn?: string | null;
  nameOriginal?: string | null;
  year?: number | string | null;
  description?: string | null;
  shortDescription?: string | null;
  genres?: Array<{ genre?: string | null }>;
  countries?: Array<{ country?: string | null }>;
};

type OpenAiTitleResponse = {
  titles?: string[];
  description?: string;
  descriptions?: string[];
};

function cleanText(value?: string | null) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

function uniqueNormalized(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const value = cleanTitle(raw);
    const key = value.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, " ").trim();

    if (!value || seen.has(key)) continue;

    seen.add(key);
    result.push(value);
  }

  return result;
}

function cleanTitle(value?: string | null) {
  return cleanText(value)
    .replace(/^[-–—:|#\s]+/, "")
    .replace(/\s*[#@][\wа-яё-]+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 88);
}

export function extractMovieSearchQuery(sourceTitle?: string | null) {
  const raw = cleanText(sourceTitle)
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/#[\wа-яё-]+/gi, " ")
    .replace(/\b(shorts?|шортс|нарезка|момент|лучшие моменты|сцена|новый фильм|фильм|кино|трейлер)\b/gi, " ")
    .replace(/\b(720p|1080p|4k|hd|full\s*hd)\b/gi, " ")
    .replace(/[|/\\_]+/g, " ")
    .replace(/[«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const quoted = raw.match(/["“”']([^"“”']{2,80})["“”']/)?.[1];
  if (quoted) return cleanText(quoted);

  const yearMatch = raw.match(/(.{2,90}?)(?:\s*\(?((?:19|20)\d{2})\)?)/);
  if (yearMatch?.[1]) return cleanText(`${yearMatch[1]} ${yearMatch[2] ?? ""}`);

  const parts = raw
    .split(/[-–—:]+/)
    .map(cleanText)
    .filter((part) => part.length >= 2)
    .sort((a, b) => a.length - b.length);

  return parts[0] || raw.slice(0, 80) || "фильм";
}

function getKinopoiskKey() {
  return process.env.KINOPOISK_API_KEY?.trim() || "";
}

async function kinopoiskFetch<T>(url: string): Promise<T | null> {
  const apiKey = getKinopoiskKey();
  if (!apiKey) return null;

  const response = await fetch(url, {
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.warn(`Kinopoisk API ${response.status}: ${text.slice(0, 300)}`);
    return null;
  }

  return (await response.json()) as T;
}

async function searchKinopoisk(keyword: string) {
  const query = encodeURIComponent(keyword);

  const v21 = await kinopoiskFetch<{
    films?: KinopoiskMovie[];
  }>(`${KINOPOISK_SEARCH_V21}?keyword=${query}`);

  const firstV21 = v21?.films?.find((movie) => movie.filmId || movie.kinopoiskId);
  if (firstV21) return firstV21;

  const v22 = await kinopoiskFetch<{
    items?: KinopoiskMovie[];
  }>(`${KINOPOISK_SEARCH_V22}?keyword=${query}&page=1`);

  return v22?.items?.find((movie) => movie.kinopoiskId || movie.filmId) ?? null;
}

async function getKinopoiskMovieDetails(movie: KinopoiskMovie | null) {
  if (!movie) return null;

  const id = movie.kinopoiskId ?? movie.filmId;
  if (!id) return movie;

  const details = await kinopoiskFetch<KinopoiskMovie>(`${KINOPOISK_FILM_V22}/${id}`);
  return details ?? movie;
}

function formatGenres(movie?: KinopoiskMovie | null) {
  return (movie?.genres ?? [])
    .map((item) => cleanText(item.genre))
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");
}

function formatCountries(movie?: KinopoiskMovie | null) {
  return (movie?.countries ?? [])
    .map((item) => cleanText(item.country))
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");
}

async function resolveMovieContext(sourceTitle?: string | null) {
  const query = extractMovieSearchQuery(sourceTitle);
  const found = await searchKinopoisk(query).catch((error) => {
    console.warn("Kinopoisk search failed", error);
    return null;
  });
  const movie = await getKinopoiskMovieDetails(found).catch((error) => {
    console.warn("Kinopoisk details failed", error);
    return found;
  });

  const movieTitle =
    cleanText(movie?.nameRu) ||
    cleanText(movie?.nameOriginal) ||
    cleanText(movie?.nameEn) ||
    query ||
    cleanText(sourceTitle) ||
    "фильм";
  const movieYear = movie?.year ? String(movie.year) : null;
  const movieDescription =
    cleanText(movie?.description) ||
    cleanText(movie?.shortDescription) ||
    cleanText(sourceTitle) ||
    "Описание фильма не найдено, используй исходное название и визуальный жанровый контекст.";

  return {
    query,
    movieTitle,
    movieYear,
    movieDescription,
    genres: formatGenres(movie),
    countries: formatCountries(movie),
  };
}

function guessStyle(genres: string, sourceTitle?: string | null) {
  const text = `${genres} ${sourceTitle ?? ""}`.toLowerCase();

  if (/воен|войн|боев|снайпер|солдат|офицер|арм|спецназ|развед|немец|русск|совет|моджахед/.test(text)) {
    return "военные / боевик / исторические сцены";
  }

  if (/истор|царь|корол|импер|средневек|дворян|боярин/.test(text)) {
    return "исторические сцены";
  }

  if (/кримин|мафи|полици|детектив|убий|преступ/.test(text)) {
    return "криминал / расследование / напряжение";
  }

  if (/ужас|триллер|мистик|страх|монстр/.test(text)) {
    return "триллер / хоррор / тревожные сцены";
  }

  return "универсальные цепляющие кино-моменты";
}

function fallbackTitleTemplates(style: string) {
  if (style.includes("военные")) {
    return [
      "Русский офицер не ожидал такого поворота",
      "Снайпер заметил врага слишком поздно",
      "Солдат попал в ловушку прямо на задании",
      "Командир понял, что их уже вычислили",
      "Разведчик увидел то, что нельзя было видеть",
      "Офицер сделал ход, после которого стало тихо",
      "Враг решил давить, но получил жесткий ответ",
      "Солдат понял, что выхода почти не осталось",
      "Снайпер выбрал цель и сразу пожалел",
      "Отряд попал туда, куда лучше не заходить",
    ];
  }

  if (style.includes("исторические")) {
    return [
      "Царь понял, кто предал его первым",
      "Боярин сказал лишнее и сразу пожалел",
      "Князь увидел заговор прямо у себя под носом",
      "Слуга услышал тайну, которая меняла всё",
      "Воевода понял, что его хотят убрать",
      "Государь заставил всех замолчать одной фразой",
      "Предатель выдал себя слишком рано",
      "Этот приказ изменил судьбу бояр",
      "Князь заметил ловушку в последний момент",
      "Царский суд закончился слишком жестко",
    ];
  }

  if (style.includes("криминал")) {
    return [
      "Он понял, что его подставили слишком поздно",
      "Детектив заметил деталь, которую все пропустили",
      "Преступник сделал одну ошибку и попался",
      "Полицейский понял, кто настоящий убийца",
      "Он открыл дверь и сразу пожалел",
      "Свидетель сказал фразу, после которой стало тихо",
      "Они думали, что всё под контролем",
      "Один звонок полностью изменил дело",
      "Он слишком поздно понял, кому поверил",
      "Эта встреча была ловушкой с самого начала",
    ];
  }

  return [
    "Он понял правду слишком поздно",
    "Эта сцена изменила всё за минуту",
    "Она заметила опасность раньше остальных",
    "Он сделал шаг и сразу пожалел",
    "Все молчали, пока он не сказал это",
    "Этот момент был ловушкой с самого начала",
    "Она поняла, что выхода больше нет",
    "Он увидел то, что лучше было не видеть",
    "Один взгляд выдал всю правду",
    "Этот поворот никто не ожидал",
  ];
}


function movieTitleLine(input: { movieTitle: string; movieYear: string | null }) {
  const title = cleanText(input.movieTitle) || "фильм";
  return `${title}${input.movieYear ? ` (${input.movieYear})` : ""}`;
}

export function buildMovieClipRedfilmDescription(input: {
  movieTitle: string;
  movieYear?: string | null;
  movieDescription?: string | null;
  clipTitle?: string | null;
  clipIndex?: number;
  sourceTitle?: string | null;
}) {
  const titleLine = movieTitleLine({
    movieTitle: input.movieTitle,
    movieYear: input.movieYear ?? null,
  });
  const clipTitle = cleanText(input.clipTitle);
  const overviewSource = cleanText(input.movieDescription) || cleanText(input.sourceTitle);
  const overview = overviewSource.length > 220
    ? `${overviewSource.slice(0, 220).trim()}…`
    : overviewSource;

  return [
    clipTitle ? `${clipTitle}.` : `Кино-момент #${input.clipIndex ?? 1}.`,
    `Фильм: ${titleLine}.`,
    overview ? `Описание: ${overview}` : "",
    "",
    "переходи смотреть на REDFILM",
    "",
    "#кино #фильмы #shorts #redfilm",
  ].filter(Boolean).join("\n");
}

function buildMovieClipDescriptions(input: {
  titles: string[];
  totalClips: number;
  movieTitle: string;
  movieYear: string | null;
  movieDescription: string;
  sourceTitle?: string | null;
}) {
  return Array.from({ length: input.totalClips }, (_, index) =>
    buildMovieClipRedfilmDescription({
      movieTitle: input.movieTitle,
      movieYear: input.movieYear,
      movieDescription: input.movieDescription,
      clipTitle: input.titles[index],
      clipIndex: index + 1,
      sourceTitle: input.sourceTitle,
    }),
  );
}

function ensureDescriptionCount(input: {
  descriptions?: string[] | null;
  titles: string[];
  totalClips: number;
  movieTitle: string;
  movieYear: string | null;
  movieDescription: string;
  sourceTitle?: string | null;
}) {
  const result: string[] = [];

  for (let index = 0; index < input.totalClips; index += 1) {
    const raw = cleanText(input.descriptions?.[index]);
    const fallback = buildMovieClipRedfilmDescription({
      movieTitle: input.movieTitle,
      movieYear: input.movieYear,
      movieDescription: input.movieDescription,
      clipTitle: input.titles[index],
      clipIndex: index + 1,
      sourceTitle: input.sourceTitle,
    });

    const titleLine = movieTitleLine({ movieTitle: input.movieTitle, movieYear: input.movieYear });
    const hasMovieTitle = raw.toLowerCase().includes(cleanText(input.movieTitle).toLowerCase());
    const hasRedfilm = /переходи\s+смотреть\s+на\s+redfilm/i.test(raw);

    if (!raw) {
      result.push(fallback);
      continue;
    }

    const lines = [raw];
    if (!hasMovieTitle) lines.push(`Фильм: ${titleLine}.`);
    if (!hasRedfilm) lines.push("", "переходи смотреть на REDFILM");
    lines.push("", "#кино #фильмы #shorts #redfilm");

    result.push(lines.join("\n").slice(0, 4500).trim());
  }

  return result;
}

function buildFallbackPack(input: {
  sourceTitle?: string | null;
  totalClips: number;
  movieTitle: string;
  movieYear: string | null;
  movieDescription: string;
  genres: string;
}) {
  const style = guessStyle(input.genres, input.sourceTitle);
  const templates = fallbackTitleTemplates(style);
  const titles: string[] = [];

  for (let index = 0; index < input.totalClips; index += 1) {
    const base = templates[index % templates.length];
    const suffix = index >= templates.length ? ` #${index + 1}` : "";
    titles.push(cleanTitle(`${base}${suffix}`));
  }

  const finalTitles = uniqueNormalized(titles).slice(0, input.totalClips);
  const descriptions = buildMovieClipDescriptions({
    titles: finalTitles,
    totalClips: input.totalClips,
    movieTitle: input.movieTitle,
    movieYear: input.movieYear,
    movieDescription: input.movieDescription,
    sourceTitle: input.sourceTitle,
  });

  return {
    movieTitle: input.movieTitle,
    movieYear: input.movieYear,
    movieDescription: input.movieDescription,
    titles: finalTitles,
    description: descriptions[0] ?? buildRussianMovieDescription({
      movieTitle: input.movieTitle,
      movieYear: input.movieYear,
      movieDescription: input.movieDescription,
      sourceTitle: input.sourceTitle,
    }),
    descriptions,
    source: "fallback" as const,
  };
}

function parseJsonFromText(text: string) {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed) as OpenAiTitleResponse;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as OpenAiTitleResponse;
    } catch {
      return null;
    }
  }
}

async function callOpenAiForTitles(input: {
  sourceTitle?: string | null;
  userDescription?: string | null;
  totalClips: number;
  clipSeconds: number;
  clipStarts: number[];
  movieTitle: string;
  movieYear: string | null;
  movieDescription: string;
  genres: string;
  countries: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const style = guessStyle(input.genres, input.sourceTitle);
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const clipRanges = input.clipStarts
    .slice(0, input.totalClips)
    .map((start, index) => {
      const fromMin = Math.floor(start / 60);
      const fromSec = Math.floor(start % 60);
      const to = start + input.clipSeconds;
      const toMin = Math.floor(to / 60);
      const toSec = Math.floor(to % 60);
      return `${index + 1}. ${fromMin}:${String(fromSec).padStart(2, "0")}–${toMin}:${String(toSec).padStart(2, "0")}`;
    })
    .join("\n");

  const systemPrompt = [
    "Ты профессиональный YouTube Shorts strategist для русскоязычного канала с кино-нарезками.",
    "Твоя задача — придумать цепляющие, короткие, сюжетные русские названия как у вирусных Shorts.",
    "Названия должны продавать конфликт сцены: кто-то кого-то поймал, наказал, предал, заметил, попал в ловушку, сделал ошибку.",
    "Пиши живо, по-русски, без канцелярита и без английского.",
  ].join(" ");

  const userPrompt = [
    `Сгенерируй ровно ${input.totalClips} уникальных названий и ровно ${input.totalClips} отдельных описаний для каждого ролика.`,
    "",
    "Стиль названий:",
    style,
    "",
    "Жёсткие правила:",
    "- только русский язык;",
    "- 35–70 символов;",
    "- без слова Shorts;",
    "- без слова фильм в каждом названии;",
    "- без Part/часть/серия;",
    "- без эмодзи;",
    "- без хэштегов в title;",
    "- не повторять одинаковую структуру подряд;",
    "- не писать название фильма в начале каждого title;",
    "- title должен звучать как отдельный сюжетный конфликт.",
    "- descriptions должны быть отдельными для каждого ролика;",
    "- в каждом description обязательно должно быть название фильма/проекта;",
    "- в каждом description обязательно должна быть точная фраза: переходи смотреть на REDFILM;",
    "- descriptions без выдуманных ссылок и без markdown.",
    "",
    "Примеры стиля:",
    "Русский офицер нашёл жену среди врагов",
    "Немецкий снайпер поймал лейтенанта",
    "Старший лейтенант попал в неприятности",
    "Русские наказали моджахедов как следует",
    "Царь Пётр первый заставил работать бояр",
    "Девушка-снайпер не ожидала такого поворота",
    "",
    "Контекст:",
    `Исходное название VK-видео: ${cleanText(input.sourceTitle) || "не указано"}`,
    `Фильм/проект: ${input.movieTitle}${input.movieYear ? ` (${input.movieYear})` : ""}`,
    `Жанры: ${input.genres || "неизвестно"}`,
    `Страны: ${input.countries || "неизвестно"}`,
    `Описание из Кинопоиска: ${input.movieDescription}`,
    input.userDescription ? `Комментарий пользователя: ${input.userDescription}` : "",
    "",
    "Таймкоды будущих клипов:",
    clipRanges,
    "",
    "Верни строго JSON без markdown:",
    `{"titles":["..."],"descriptions":["описание 1 с названием фильма и фразой переходи смотреть на REDFILM","описание 2 ..."],"description":"общий fallback"}`,
  ].filter(Boolean).join("\n");

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.85,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.warn(`OpenAI title generation failed ${response.status}: ${text.slice(0, 500)}`);
    return null;
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  return parseJsonFromText(content);
}

function buildRussianMovieDescription(input: {
  movieTitle: string;
  movieYear: string | null;
  movieDescription: string;
  sourceTitle?: string | null;
}) {
  const titleLine = `${input.movieTitle}${input.movieYear ? ` (${input.movieYear})` : ""}`;
  const overview = input.movieDescription.length > 260
    ? `${input.movieDescription.slice(0, 260).trim()}…`
    : input.movieDescription;

  return [
    `Короткая нарезка из кино: ${titleLine}.`,
    overview,
    "",
    "Подписывайся, чтобы не пропустить новые сильные сцены.",
    "",
    "#кино #фильмы #shorts",
  ].join("\n");
}

function ensureTitleCount(titles: string[], totalClips: number, fallback: string[]) {
  const result = uniqueNormalized(titles);

  for (const title of fallback) {
    if (result.length >= totalClips) break;
    result.push(title);
  }

  while (result.length < totalClips) {
    result.push(`Сцена стала напряжённой слишком быстро ${result.length + 1}`);
  }

  return result.slice(0, totalClips).map(cleanTitle);
}

export async function generateMovieAiTitlePack(input: {
  sourceTitle?: string | null;
  userDescription?: string | null;
  totalClips: number;
  clipSeconds: number;
  clipStarts: number[];
  onProgress?: (progress: number, label: string) => Promise<void>;
}): Promise<MovieAiTitlePack> {
  const totalClips = Math.max(1, Math.min(40, input.totalClips));

  await input.onProgress?.(32, "Ищу фильм в Кинопоиске для AI-названий");

  const context = await resolveMovieContext(input.sourceTitle);
  const fallback = buildFallbackPack({
    sourceTitle: input.sourceTitle,
    totalClips,
    movieTitle: context.movieTitle,
    movieYear: context.movieYear,
    movieDescription: context.movieDescription,
    genres: context.genres,
  });

  await input.onProgress?.(34, "Генерирую цепляющие русские названия через AI");

  const ai = await callOpenAiForTitles({
    sourceTitle: input.sourceTitle,
    userDescription: input.userDescription,
    totalClips,
    clipSeconds: input.clipSeconds,
    clipStarts: input.clipStarts,
    movieTitle: context.movieTitle,
    movieYear: context.movieYear,
    movieDescription: context.movieDescription,
    genres: context.genres,
    countries: context.countries,
  }).catch((error) => {
    console.warn("OpenAI title generation failed", error);
    return null;
  });

  if (!ai?.titles?.length) {
    return fallback;
  }

  const titles = ensureTitleCount(ai.titles, totalClips, fallback.titles);
  const descriptions = ensureDescriptionCount({
    descriptions: ai.descriptions,
    titles,
    totalClips,
    movieTitle: context.movieTitle,
    movieYear: context.movieYear,
    movieDescription: context.movieDescription,
    sourceTitle: input.sourceTitle,
  });
  const description = descriptions[0] || cleanText(ai.description) || fallback.description;

  return {
    movieTitle: context.movieTitle,
    movieYear: context.movieYear,
    movieDescription: context.movieDescription,
    titles,
    description: description.length > 4500 ? description.slice(0, 4500).trim() : description,
    descriptions,
    source: "openai",
  };
}
