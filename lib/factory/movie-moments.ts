const MOVIE_MOMENTS_PREFIX = "MOVIE_MOMENTS::";

const BLOCKED_MOVIE_TITLE_PARTS = [
  "movie moment:",
  "wait for the ending",
  "watch till the end",
  "this clip turned insane",
  "this moment was crazy",
  "crazy movie moment",
  "movie clip",
  "film clip",
];

const MOVIE_TITLE_TEMPLATES = [
  "This movie scene got dark fast",
  "She noticed it before everyone else",
  "This scene changed the whole movie",
  "Nobody expected this movie ending",
  "He should have left sooner",
  "This movie moment felt too real",
  "The room went silent after this",
  "This scene was a trap from the start",
  "She saw something behind him",
  "This movie twist came out of nowhere",
  "He realized the truth too late",
  "This scene got creepy in seconds",
  "The warning came way too late",
  "This movie moment gave me chills",
  "He opened the wrong door",
  "This scene went from calm to terrifying",
  "She knew something was wrong",
  "This was the moment everything changed",
  "The ending of this scene hurts",
  "This movie reveal was actually insane",
  "He made the worst possible choice",
  "This scene was quiet for a reason",
  "The camera caught something strange",
  "This movie scene aged too well",
  "The twist was hiding in plain sight",
  "He missed the biggest warning sign",
  "This scene became scary too fast",
  "Everyone ignored the obvious clue",
  "This moment explains the whole movie",
  "The final look said everything",
];

const MOVIE_EMOJIS = ["😳", "👀", "😨", "🎬", "😱", "🫣", "💀", "🤯"];

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, " ").replace(/\s+/g, " ").trim();
}

export function encodeMovieMomentsPrefix(movieTitle: string) {
  const title = movieTitle.replace(/\s+/g, " ").trim() || "Movie";
  return `${MOVIE_MOMENTS_PREFIX}${title}`;
}

export function isMovieMomentsTitlePrefix(value?: string | null) {
  return Boolean(value?.startsWith(MOVIE_MOMENTS_PREFIX));
}

export function decodeMovieMomentsTitlePrefix(value?: string | null) {
  if (!value?.startsWith(MOVIE_MOMENTS_PREFIX)) return null;
  return value.slice(MOVIE_MOMENTS_PREFIX.length).trim() || "Movie";
}

export function isBadMovieMomentTitle(title: string) {
  const lower = title.toLowerCase();
  return (
    !title.trim() ||
    title.length > 95 ||
    BLOCKED_MOVIE_TITLE_PARTS.some((part) => lower.includes(part)) ||
    /^part\s*\d+/i.test(title) ||
    /^movie\s*(scene|moment|clip)?\s*:?/i.test(title.trim())
  );
}

export function generateUniqueMovieMomentTitle(input: {
  title?: string | null;
  movieTitle?: string | null;
  clipIndex: number;
  seed?: string | null;
  usedTitles: Set<string>;
}) {
  const movieTitle = (input.movieTitle ?? "Movie").replace(/\s+/g, " ").trim();
  const seedBase = `${movieTitle}:${input.seed ?? ""}:${input.clipIndex}`;
  const startHash = hashString(seedBase);
  let candidate = (input.title ?? "").replace(/\s+/g, " ").trim();

  if (isBadMovieMomentTitle(candidate)) {
    const templateIndex = startHash % MOVIE_TITLE_TEMPLATES.length;
    const emojiIndex = (startHash >>> 8) % MOVIE_EMOJIS.length;
    candidate = `${MOVIE_TITLE_TEMPLATES[templateIndex]} ${MOVIE_EMOJIS[emojiIndex]}`;
  }

  candidate = candidate.replace(/^movie\s*moment\s*:\s*/i, "").replace(/\s+/g, " ").trim();
  if (!/[😳👀😨🎬😱🫣💀🤯]/u.test(candidate) && candidate.length < 82) {
    candidate = `${candidate} ${MOVIE_EMOJIS[(startHash >>> 12) % MOVIE_EMOJIS.length]}`;
  }

  let attempt = 0;
  let finalTitle = candidate.slice(0, 95).trim();
  while (input.usedTitles.has(normalize(finalTitle)) || isBadMovieMomentTitle(finalTitle)) {
    attempt += 1;
    const templateIndex = (startHash + attempt * 7) % MOVIE_TITLE_TEMPLATES.length;
    const emojiIndex = (startHash + attempt * 11) % MOVIE_EMOJIS.length;
    finalTitle = `${MOVIE_TITLE_TEMPLATES[templateIndex]} ${MOVIE_EMOJIS[emojiIndex]}`.slice(0, 95).trim();
    if (attempt > MOVIE_TITLE_TEMPLATES.length + 4) {
      finalTitle = `${MOVIE_TITLE_TEMPLATES[templateIndex]} #${input.clipIndex + attempt}`.slice(0, 95).trim();
      break;
    }
  }

  input.usedTitles.add(normalize(finalTitle));
  return finalTitle;
}
