const MENU_OR_GENERIC_TITLE_RE = /^(?:vk|vk video|vk видео|вк видео|главная|новые|популярное|плейлисты|клипы|video-?\d+_\d+|vk фильм(?:\s*\d+)?)(?:\s|$)/i;

const UNRELATED_MOVIE_TERMS = [
  "хоббит",
  "властелин",
  "кольц",
  "братство кольца",
  "фродо",
  "гэндальф",
  "саурон",
  "голлум",
  "средизем",
  "мордор",
  "эльф",
  "орки",
  "орк",
];

function cleanInline(value?: string | null) {
  return (value ?? "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[🔥✅🎬🍿📺👉🤖⚡️⭐️💥]/g, " ")
    .replace(/#[\wа-яё-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripServiceNoise(value: string) {
  return value
    .replace(/^\s*(?:VK|ВК)\s*(?:Видео|Video)\s*[:\-–—]?\s*/i, "")
    .replace(/\b(?:всегда\s+доступные\s+фильмы|подписывайся|смотрите\s+на\s+redfilm|переходи\s+смотреть\s+на\s+redfilm)\b.*$/i, "")
    .replace(/\b(?:жанр|жанры|описание|кратко|смотреть|смотрите|подписка|канал)\s*[:：].*$/i, "")
    .replace(/\s+\/\s+.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function trimDecorations(value: string) {
  return value
    .replace(/^[\s|:;,.\-–—«»"'()\[\]]+/, "")
    .replace(/[\s|:;,.\-–—«»"'()\[\]]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyGenericTitle(value?: string | null) {
  const text = cleanInline(value).toLowerCase();
  return !text || text.length < 3 || MENU_OR_GENERIC_TITLE_RE.test(text);
}

export function normalizeMovieTitleFromSource(input?: string | null): {
  movieTitle: string | null;
  movieYear: string | null;
  searchQuery: string | null;
} {
  const raw = cleanInline(input);
  if (!raw || isLikelyGenericTitle(raw)) {
    return { movieTitle: null, movieYear: null, searchQuery: null };
  }

  const year = raw.match(/\b((?:19|20)\d{2})\b/)?.[1] ?? null;
  let candidate = stripServiceNoise(raw);

  const beforeFire = candidate.split(/\s*[🔥✅🎬🍿📺👉⚡️⭐️💥]\s*/)[0];
  if (beforeFire && beforeFire.length >= 3) candidate = beforeFire;

  const beforeGenre = candidate.split(/\b(?:жанр|описание|кратко|смотреть|подписывайся)\b\s*[:：]?/i)[0];
  if (beforeGenre && beforeGenre.length >= 3) candidate = beforeGenre;

  if (candidate.includes("|")) {
    const parts = candidate
      .split("|")
      .map((part) => trimDecorations(part.replace(/\b(?:19|20)\d{2}\b/g, "")))
      .filter((part) => part.length >= 2);
    const cyrillic = parts.find((part) => /[а-яё]/i.test(part));
    candidate = cyrillic || parts[0] || candidate;
  }

  candidate = candidate
    .replace(/\([^)]*(?:19|20)\d{2}[^)]*\)/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\b(?:mp4|720p|1080p|480p|360p|240p|4k|hd|full\s*hd)\b/gi, " ")
    .replace(/\b(?:фильм|кино|боевик|триллер|драма|комедия|ужасы|мелодрама)\b\s*$/gi, "")
    .replace(/\s+/g, " ");

  candidate = trimDecorations(candidate);

  if (isLikelyGenericTitle(candidate)) {
    return { movieTitle: null, movieYear: year, searchQuery: null };
  }

  if (candidate.length > 90) candidate = trimDecorations(candidate.slice(0, 90));

  return {
    movieTitle: candidate || null,
    movieYear: year,
    searchQuery: [candidate, year].filter(Boolean).join(" ") || null,
  };
}

export function buildVkRuTitlePrefix(movieTitle?: string | null) {
  const title = cleanInline(movieTitle) || "VK фильм";
  return `VK_RU:${title}`.slice(0, 100);
}

export function containsUnrelatedMovieTerms(text?: string | null, movieTitle?: string | null) {
  const value = cleanInline(text).toLowerCase();
  if (!value) return false;
  const title = cleanInline(movieTitle).toLowerCase();
  return UNRELATED_MOVIE_TERMS.some((term) => value.includes(term) && !title.includes(term));
}

export function sanitizeMovieClipTitle(input: {
  title?: string | null;
  fallback: string;
  movieTitle?: string | null;
}) {
  const title = trimDecorations(cleanInline(input.title));
  if (!title || title.length < 8) return input.fallback;
  if (containsUnrelatedMovieTerms(title, input.movieTitle)) return input.fallback;
  return title.slice(0, 88);
}
